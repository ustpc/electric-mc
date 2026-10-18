# Email ingestion

Status: proposed, 2026-10-18. Electric MC fills its manuscript and assignment
records from the notification emails Manuscript Central sends. This document
covers how the email reaches AWS, what kinds of message arrive, and what each
one changes in DynamoDB. The schema is in
[Technical Stack and Architecture.md](Technical%20Stack%20and%20Architecture.md#5-dynamodb-schema-proposed).

The catalog below comes from the 77 messages in the local, git-ignored
`var/mbox` (CACM Opinion section, 2024-02 to 2026-10). It shows wording and
structure only. Real names, titles and reviewer comments are deliberately
left out, because `var/` must never be committed.

## 1. Getting email to Lambda

**Yes, email can go straight to Lambda.** Amazon SES email receiving accepts
mail for a domain whose MX record points at SES. A receipt rule can then
store the raw message in S3 and invoke a Lambda function. No IMAP polling is
needed.

Proposed setup:

1. Create a receiving subdomain, for example `in.<our domain>`, with its MX
   record pointing at SES inbound (`inbound-smtp.<region>.amazonaws.com`).
   Receiving is only offered in some regions, including us-east-1, us-west-2
   and eu-west-1, so the stack goes in one of those.
2. Forward the Manuscript Central mail to an address on that subdomain. The
   sample mail already reaches `cacm-opn@simson.net` by forwarding, so one
   more forward from there is enough.
3. Receipt rule: accept only that address. Store the raw message in an S3
   bucket under `raw/` with a 30-day lifecycle expiry, then invoke the
   `ingest` Lambda (Rust, like the others) with the S3 key.
4. The Lambda parses the message, writes to DynamoDB, and records the
   `Message-ID` so duplicates are ignored. The sample has exact duplicates,
   for example two copies of the same reminder sent in the same second.

Cost: SES charges about $0.10 per 1,000 messages received, plus a small
amount per 256 KB chunk. A few hundred messages a month costs a few cents.
S3 storage for 30 days of raw mail is negligible. Check current prices
before launch.

**Fallback, polling IMAP:** an EventBridge Scheduler rule runs the `ingest`
Lambda every 10 minutes (about 4,400 invocations a month, well inside the free
tier). It logs in to the IMAP server with credentials kept in SSM Parameter
Store as a SecureString (free), fetches unseen messages, and runs the same
parser. Use this only if forwarding to SES isn't possible. It's slower, and
it means storing a mailbox password in AWS.

## 2. What every message has in common

- **Sender:** `From:` is the journal name `<onbehalfof@manuscriptcentral.com>`.
  `Reply-To:` names the real sender: the EiC, the section co-chair, the
  editorial office (`admin@`), or an AE's own address.
- **ScholarOne headers:** `X-PRODUCT: s1m`, `X-ENV-TYPE: prod`, `X-ENV-NAME`
  (a site number), and `X-S1Info` (an opaque token, different for every
  message). These identify genuine ScholarOne mail and are a cheap first
  filter. Anything without `X-PRODUCT: s1m` is dropped. The sample includes a
  Gmail forwarding confirmation that must be ignored.
- **Body:** plain text. The first line is the send date as `DD-Mon-YYYY`,
  followed by a "Dear …:" salutation.
- **Manuscript ID:** `<JOURNAL>-<YY>-<MM>-<NNNN>`, with `.R<n>` for revisions
  (for example `CACM-26-10-9003`, `CACM-26-03-9002.R2`). It appears in the
  subject and the body. Spacing varies: some subjects have a double space
  after "ID", and subjects are folded across lines. Unfold and collapse
  whitespace before matching.
- **Site and deep link:** `https://mc.manuscriptcentral.com/<site>`, and in many
  messages a one-manuscript link `…/<site>?URL_MASK=<32 hex>`. The link needs a
  login, but it's worth storing so the dashboard and chat can link straight
  to the manuscript.
- **Article type:** "This is a Opinion submission." (sic) gives the type.
- **Attachments:** some messages carry a `PDF_Proof.PDF`, reviewer report PDFs,
  or an `.ics` calendar file. The parser ignores attachments.

## 3. Message catalog

"Recipient" means the `To:` address. In this journal, the section co-chair
works from a shared role mailbox, so several message types are addressed to
the role rather than a person (see section 5).

| # | Subject pattern (simplified) | Recipient | What it tells us | DynamoDB update |
|---|------------------------------|-----------|------------------|-----------------|
| 1 | `Manuscript ID <id> - "<title>" is now ready for Associate Editor Assignment` | Assigning editor (co-chair) | A new submission or revision needs an AE. The body gives the submitting author's surname and the article type. | Upsert `META` (title, type, `status = AWAITING_AE_ASSIGNMENT`, `statusChangedAt`). Make sure an `ASSIGNING_EDITOR` role exists for the recipient. |
| 2 | `Manuscript ID <id> - <title> - assigned` | The co-chair, when they assign a manuscript to themselves as AE | "has been assigned to you and is currently sitting in your Associate Editor Center" | Upsert a `HANDLING_AE` role for the recipient (active, `assignedAt`). `status = AWAITING_REVIEWER_SELECTION`. Store the deep link. |
| 3 | `Manuscript ID <id> "<title>" now in your Associate Editor Center` | The AE, with the co-chair on Cc | Who the AE is (the `To:` address and the "Dear Dr. X" name), the reviewer-selection deadline ("by DD-Mon-YYYY"), the deep link, and sometimes a personal note from the assigner above the template text | Upsert the AE's person record by email. Upsert the `HANDLING_AE` role (active, `assignedAt`, `reviewerSelectionDue`), and deactivate any earlier AE role on the same manuscript. `status = AWAITING_REVIEWER_SELECTION`. Don't store the personal note. |
| 4 | `Reviewer selections for Manuscript ID <id> "<title>" now due` | The AE, with the co-chair on Cc | The AE hasn't selected reviewers. The body says how many days it has waited. | Set `reviewerSelectionOverdue = true` and `daysWaiting` on the AE's role item. This feeds the workload page. |
| 5 | `… Manuscript ID <id> - <title>` with body "is now ready for your recommendation" | The co-chair, from the EiC | Reviews are in, and a recommendation is needed | `status = AWAITING_RECOMMENDATION`, `statusChangedAt`. |
| 6 | `… Manuscript ID <id> - <title> - Recommendation now due` | The co-chair, from the EiC | The recommendation is overdue | `recommendationOverdue = true`, `recommendationDueSeenAt`. |
| 7 | `… Decision on Manuscript ID <id>` | The author (the co-chair's copy is a blind copy) | The decision. The wording separates outright decline ("must decline"), reject and resubmit ("may submit a new and revised manuscript"), revise, and accept. | Set `decision` and `decidedAt`. For a final decision, set `status = DECIDED` and set every role on the manuscript to `active = false`, removing `GSI3PK` and `GSI3SK` so it leaves the workload index. For revise, `status = AWAITING_REVISION`. Don't store the reviewer comments or the author's address. |
| 8 | `… Plagiarism Percent Match Threshold Exceeded <id>` | The co-chair, with the editorial office on Cc | The similarity score (for example `62%`) and the deep link | Set `similarityPercent` and `similarityFlaggedAt` on `META`. The dashboard shows a flag. |
| 9 | `Manuscript Accepted – Please Update <id>` | The author | Accepted, and final files are requested | `status = ACCEPTED`, `decision = ACCEPT`. Deactivate roles. |
| 10 | `… Manuscript ID <id>` with body "has been successfully submitted" | The author | The mailbox owner submitted this paper as an author | Record an `AUTHOR` role for the owner. Electric MC hides these manuscripts from that person's editor views, to avoid conflicts of interest. |
| 11 | `Invitation to Review …` and `… now in your Reviewer Center` | The reviewer | The mailbox owner is invited or assigned to review. The body gives the due date. | Upsert a `REVIEWER` role (`invitedAt`, `reviewDue`). |
| 12 | `Thank you for submitting your review of Manuscript ID <id> …` | The reviewer | The review is complete | `reviewSubmittedAt`. Set the reviewer role to `active = false`. |
| 13 | `… Account Modified in Manuscript Central`, `… Manuscript Central Account Info` | The account holder | Account changes. **These contain single-use password links.** | **Drop immediately. Never store, log or forward.** The S3 copy is deleted by the Lambda right after classification. |

Messages that match no pattern are kept in S3 under `unparsed/` and counted on
an admin page, so new templates can be added without losing data.

Templates are set per journal, so each journal gets a small pattern file
(subject regex, body regex, and the fields to extract). The patterns are data
loaded by the `ingest` Lambda, not hard-coded, in the same spirit as the
restyling selectors.

## 4. Parsing rules

- Unfold headers, decode RFC 2047 words, and normalize whitespace and curly
  quotes before matching.
- Match the manuscript ID with
  `\b([A-Z][A-Z0-9]+-\d{2}-\d{2}-\d{4,})(\.R(\d+))?\b`. Store the base ID
  and the revision number separately (Design Goals 6.2).
- Take the event time from the body's first-line date, falling back to the
  `Date:` header. Keep both.
- Treat each message as an **event**. Updates are idempotent and
  order-tolerant: a field is only changed if the event is newer than the
  `statusChangedAt` already stored, so redelivered or out-of-order mail
  can't move a manuscript backwards.
- Never store message bodies, reviewer comments, author email addresses,
  personal notes, or attachments. Store only the extracted fields.

## 5. Schema changes this needs

- **Role mailboxes.** Some recipients are role accounts, not people (for
  example a section co-chair's shared address). Add an item
  `MAILBOX#<address>` / `MAP` → `{kind: PERSON | ROLE, sub?, role?, site}`, so
  the parser can map an address to a person or to a journal role. The admin
  loader fills it, and unknown addresses create a `PERSON` stub with
  `unverified = true`.
- **Ingest log.** `INGEST#<yyyy-mm>` / `<Message-ID>`: type, manuscript, result,
  and a TTL of 90 days. This is used for de-duplication and debugging.
- **New `META` attributes:** `articleType`, `deepLink`, `decision`,
  `decidedAt`, `similarityPercent`, `recommendationOverdue`.
- **New role attributes:** `reviewerSelectionDue`, `reviewerSelectionOverdue`,
  `daysWaiting`, `reviewDue`, `reviewSubmittedAt`.
- **New role value:** `AUTHOR`, used to hide a person's own submissions from
  their editor views.

## 6. Open questions

1. Can mail be forwarded from `cacm-opn@simson.net` to an SES address on a
   subdomain we control, or must we poll IMAP?
2. Should the co-chair's shared role mailbox map to Simson personally, or to
   the role (so a future co-chair inherits it)? The default is the role.
3. Do we want the decision letters' decision type only, or also the date the
   author is due to send a revision?
