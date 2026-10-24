# Reviewer discussions for another journal (PACMHCI CSCW evaluation)

Status: proposal, 2026-10-24. Not built. Nothing here is in a release.

A co-Editor-in-Chief of the CSCW track of *Proceedings of the ACM on
Human-Computer Interaction* (PACMHCI) has asked whether Electric MC could let
that track's **reviewers and associate editors discuss a submission** inside
Manuscript Central. This document works out what that needs for security,
anonymity, onboarding and tenancy, and compares two ways to build it:

- **Option A:** the backend we already designed: Lambda function URLs, an
  on-demand DynamoDB table, and Cognito
  ([Technical Stack and Architecture.md](Technical%20Stack%20and%20Architecture.md)
  sections 3 to 5).
- **Option B:** [Graffiti](https://graffiti.garden), the framework for
  interoperable social apps from David Karger's group at MIT
  ([MIT News, 2025-10-01](https://news.mit.edu/2025/system-lets-people-personalize-online-social-spaces-while-staying-connected-1001);
  paper: Henderson, Karger and Clark, UIST 2025,
  [arXiv:2508.04889](https://arxiv.org/abs/2508.04889),
  [doi:10.1145/3746059.3747627](https://doi.org/10.1145/3746059.3747627)).

**Recommendation: Option A**, extended as described in section 3. Graffiti
is a good design for open, interoperable social spaces, but confidential peer
review needs the opposite properties: a party that decides who may read,
can revoke access, can delete on schedule, and hides reviewers from each
other. Section 4 gives the comparison and section 5 the reasons.

All examples use synthetic data (`XYZJ-1000`, "Reviewer, Robin"). No data
from either journal's Manuscript Central site appears here.

---

## 1. What the CSCW track needs

The requirements below come from the request, from how peer review works on
Manuscript Central, and from the
[ACM Peer Review Policy](https://www.acm.org/publications/policies/peer-review).
Items marked *(confirm)* should be checked with the track's EICs before
building.

1. **A per-manuscript discussion** among the handling AE and that
   manuscript's reviewers, with the EICs able to read it.
2. **Reviewer anonymity.** Reviewers see each other as "Reviewer 1",
   "Reviewer 2" and so on, never by name or email, unless the journal chooses
   otherwise *(confirm: some venues reveal reviewer names to each other after
   decision)*. The handling AE and EICs know who each reviewer is, as they
   do in Manuscript Central.
3. **Authors never have access**, and nothing in the discussion tool reveals
   reviewer identities to them. Whether the review is single- or double-blind
   is a per-journal setting (`blindReview`, Technical Stack 5.2) *(confirm
   for CSCW)*.
4. **No discussion before the reviews are in.** Reviewers should not read
   each other's opinions before they submit their own review, or the reviews
   stop being independent. The AE opens the discussion when they are ready.
5. **Private channels.** A reviewer can write to the AE alone, and the AE
   can write to the EICs alone.
6. **Conflicts of interest.** Nobody who is an author of the submission, or
   is otherwise conflicted, can read its discussion, even if they hold a role
   on another manuscript or are an AE on the same journal.
7. **Retention.** The discussion is kept for a set time after the final
   decision and then deleted.
8. **No LLMs.** Nothing from the discussion goes to any server-side AI
   service (Privacy Policy section 8).
9. **Works for people who aren't on Simson's journal**, with a different
   EIC, a different set of AEs, and **no copy of that journal's assignment
   emails**.
10. **Reasonable interactivity.** Review discussion is asynchronous, over
    days, so a message showing up within 15 to 60 seconds is enough. Unread
    counts should be visible when a participant opens Manuscript Central.

---

## 2. The hard part: knowing who is assigned to what

For Simson's journal, the note-access design trusts **ingested ScholarOne
emails**: the co-chair mailbox is copied on every assignment email, so the
server learns who the AE is from Manuscript Central itself, and the extension's
scraped roles are only hints. The CSCW track has no such feed. Something else
must tell the server who may read each discussion, and it must be hard for a
conflicted person to add themselves.

### 2.1 A chain of attestations

The proposal is a short chain of trust, where each link is a person who
already has that authority in Manuscript Central and who vouches for the
next link from what their own Manuscript Central page shows them:

| Step | Who vouches | What they vouch for | How |
|------|-------------|---------------------|-----|
| 1 | Simson (platform operator) | Who the journal's **tenant admins** are (the EICs) | Out of band: the EIC tells Simson their verified email addresses; Simson creates the tenant and grants the role by hand. |
| 2 | An EIC | **Which AE handles which manuscript** | The EIC opens their EIC or admin list in Manuscript Central. The extension reads the manuscript IDs and assigned AEs from that page, shows them as a checklist, and the EIC confirms with one click ("Sync AE assignments"). |
| 3 | The handling AE | **Who the reviewers are** and their reviewer numbers | On the manuscript's AE page, the extension reads the reviewer list. The AE ticks who to invite and clicks "Open discussion". |
| 4 | The reviewer | That they own the invited address | They sign in with Cognito using an emailed one-time code sent to the address the AE invited. |

Every attestation is stored with who made it and when, and the EICs can see
and revoke any of them. The server accepts a step-2 attestation only from a
tenant admin, and a step-3 attestation only from the AE that step 2 made
the handler of that manuscript. A person can never vouch for themselves.

This keeps the rule from the note-access design that **a role scraped by
the extension is never trusted on its own**: here the scrape is only a
convenience that fills in a form, and a person who holds the authority
confirms it.

### 2.2 Stronger: email attestation, if ACM staff can add it

If the CSCW track's Manuscript Central administrators can add a Cc or Bcc
address to the "AE assigned" and "reviewer agreed" email templates *(confirm
with ACM staff; we have not verified that the template settings allow it)*,
the same SES ingestion pipeline ([Email ingestion.md](Email%20ingestion.md))
can make the server learn assignments from Manuscript Central directly.
The journal's tenant then switches from "EIC-attested" to "email-attested"
in its configuration. Until then, section 2.1 works with no change on
Manuscript Central's side.

### 2.3 Fallback: AE self-claim with audit

A journal that wants the least setup could let an AE's extension claim the
manuscripts in their own AE Center, with every claim shown to the EICs and
revocable. We do **not** recommend it for CSCW: a conflicted AE could claim
a manuscript they should not see, and the EICs would only notice afterwards.
It is listed so the configuration has a name for it.

### 2.4 Reviewer invitations without Electric MC sending email

All Electric MC email currently goes only to the co-chair (Privacy Policy
section 9), and SES would need production access to mail strangers. So the
server does not email reviewers. When the AE opens the discussion, the
server returns **one invitation link per reviewer**, each bound to that
reviewer's address. The AE sends the links themselves, for example with
Manuscript Central's own "email reviewer" feature. A link works only after
the person signs in and proves, by an emailed Cognito code, that they own
the invited address; a forwarded link is useless to anyone else. The AE can
add a second address for a reviewer who uses another one.

Cognito sends that sign-in code, not Electric MC. Cognito's built-in sender
is limited to a small daily quota (about 50 emails a day), which is enough
for a pilot. A larger rollout would point Cognito at SES, which needs SES
production access; that is a setting, not a design change.

---

## 3. Option A in detail: Lambda, DynamoDB and Cognito

### 3.1 Authentication and onboarding

- **Sign-in:** the existing Cognito user pool, with **passwordless email
  one-time codes** as the default for reviewers, since most will use the
  tool for a few weeks and should not have to make a password. The
  extension uses `chrome.identity.launchWebAuthFlow` with PKCE, as already
  planned.
- **Binding to a Manuscript Central person:** a Cognito account is linked to
  the address it verified. Roles are granted to an address (section 2), and
  a signed-in user gets every role granted to any address they have
  verified.
- **Onboarding a reviewer** takes four steps: install the extension, click
  the invitation link, enter the emailed code, and see the discussion in the
  side panel on that manuscript's Reviewer Center page.
- **No E-MC account needed** for anything else. The extension keeps working
  as today for people who never sign in.
- **Cost:** Cognito's free tier covers 10,000 monthly active users, far more
  than a journal track needs.

### 3.2 Data model changes

The table in Technical Stack section 5 already keys everything by
`<site>` and has `REVIEWER` roles, `reviewerNumber`, and per-message
`visibility` sets. The changes are:

| Change | Detail |
|--------|--------|
| **Tenant key** | Replace `<site>` with `<tenant>`, a journal or track that may share a Manuscript Central site with others. A PACMHCI site may host several tracks, each with its own EICs, so the tenant is chosen by the manuscript-ID prefix as well as the site. |
| **Tenant config** | `JOURNAL#<tenant>` / `CONFIG` gains `assignmentSource` (`email`, `eic_attested`, `ae_claim`), `reviewerAnonymity` (`numbered`, `named`), `discussionRetentionDays`, `reviewerAccessAfterDecision` (`read`, `none`), and `admins` (the EICs). |
| **Attestation** | `MS#<tenant>#<baseId>` / `ATTEST#<ulid>` with `by`, `grants` (role, address, reviewer number), `at`, `revokedAt`. The `ROLE#` items are derived from these. |
| **Invitation** | `INVITE#<tokenHash>` with `tenant`, `baseId`, `role`, `reviewerNumber`, `email`, `expiresAt` (14 days). The email is deleted when the invite is accepted or expires. |
| **Discussion state** | `HEAD` gains `discussionOpen` (bool) and `openedBy`. Reviewers get nothing until it is true. |
| **Pseudonymous author label** | Messages already store `author` as a Cognito subject. The Lambda never returns the subject or name to a reviewer; it returns "Reviewer *n*", "Handling AE" or "EIC". |
| **Conflict marker** | `MS#<tenant>#<baseId>` / `COI#<sub>`, written by an EIC, which blocks that person from the manuscript whatever other role they hold. |

### 3.3 Access check on every request

The `api` Lambda already verifies the Cognito JWT itself and filters
messages by the caller's roles. For reviewer discussions it does, in order:

1. Take the tenant from the requested manuscript, never from the request
   body or the extension's idea of the user's role.
2. Deny if the caller has a `COI#` marker on this manuscript.
3. Load the caller's active `ROLE#` items for this manuscript. Deny if none,
   unless the caller is a tenant admin of this tenant.
4. If the caller is a reviewer, deny until `discussionOpen` is true, then
   return only messages whose `visibility` includes `REVIEWERS`, plus the
   reviewer's own private messages to the AE.
5. Replace every `author` with its role label before returning. For a
   reviewer caller, strip anything that could identify another reviewer
   (subject, email, display name, edit-history actor).
6. Never answer differently for "no such manuscript" and "not allowed", so a
   probe cannot learn which manuscripts exist.

Tenant admins read everything in their own tenant only. Every admin read of
a discussion they are not a participant in is logged, and the log is
visible to the other EICs of that tenant. Simson's co-chair override applies
only to his own journal's tenant.

### 3.4 Conflicts of interest

- **Default deny:** access exists only through an attestation for that
  manuscript, so an AE or reviewer who is an author of another submission
  never sees its discussion simply by being on the journal.
- **Author check without storing authors:** when the AE opens a discussion,
  the extension compares each invited reviewer's address with the
  manuscript's author addresses **on the AE's own computer** and warns on a
  match. Author addresses are never sent to the server, which keeps the
  promise in Privacy Policy section 1.
- **Manual block:** an EIC can add a `COI#` marker for anyone on any
  manuscript, and it overrides every grant.
- **EICs who are conflicted:** a co-EIC can be blocked the same way, so a
  co-EIC who is an author on a submission cannot read its discussion.
- Manuscript Central's own conflict handling still decides who is invited
  to review in the first place; Electric MC only follows it.

### 3.5 Anonymity in practice

The server keeps reviewers anonymous to each other, but some leaks are
outside its control, and the reviewer guidance should say so:

- What a reviewer writes can identify them. The posting box shows a reminder
  that other reviewers will see the text.
- Timing can identify someone in a small discussion. Message times shown to
  reviewers are rounded to the hour.
- Reviewer labels follow Manuscript Central's reviewer numbers when the AE's
  page shows them, so "Reviewer 2" means the same person in the decision
  letter and in the discussion.
- **The operator can see everything.** The table is encrypted at rest with
  AWS's key, but whoever runs the AWS account can read the plaintext and
  the reviewer-to-label mapping. Section 3.7 covers who that should be.

### 3.6 Interactivity and cost

The polling design in Technical Stack 3.2 is enough for asynchronous review
discussion: one `GetItem` on `HEAD` per poll, only while the panel is
visible, every 15 s while active and 60 s while unfocused. The side panel
also shows an unread count on each manuscript row in the Reviewer and AE
Centers, so nobody has to keep a panel open to notice new messages.

Rough load for one large track during a discussion period: 200 active
participants, each with a discussion visible 20 minutes a day, polling every
30 seconds on average, gives 200 × 40 × 30 ≈ **240,000 Lambda requests a
month** and a similar number of half-unit DynamoDB reads. That stays inside
the 1M-request Lambda free tier together with Simson's journal, and
DynamoDB on-demand cost is cents. If several journals join, the poll can be
batched per user (already planned) and the interval stretched to 60 s.

### 3.7 Retention

- Discussion messages, their edit history and their attestations get an
  `expiresAt` of the final decision date plus `discussionRetentionDays`
  (proposed default **180 days**, which covers revise-and-resubmit). TTL
  deletion is free.
- If the manuscript comes back as a revision, the AE can carry the
  discussion forward, which resets the clock.
- Reviewers keep **read** access until the messages expire, so they can see
  how the discussion ended, unless the journal sets
  `reviewerAccessAfterDecision = none`. (For AEs, Simson already decided that
  ex-AEs keep read access to what was posted while they were assigned.)
- Invitations hold an email address for at most 14 days.
- The journal's EICs can delete a manuscript's discussion at any time.

### 3.8 Tenancy and who runs the servers

The table design already separates journals by key. The question for a
second journal is **governance**, not storage: today the backend runs in
Simson's personal AWS account. A different journal's reviewer discussions
would sit in an account run by an EIC of another journal. Three ways to
handle that, in increasing isolation:

| Model | What it means | Cost | When it fits |
|-------|---------------|------|--------------|
| Shared deployment | One table and one Cognito pool, tenants separated by key and by the Lambda's checks. | No extra cost. | The other journal's EICs and ACM accept Simson as operator, in writing. |
| Shared account, separate stacks | A second copy of the SAM/CDK stack (own table, own Lambda, own pool) in the same AWS account. | Still free tier, but two stacks share the Lambda free allowance. | A code bug in one tenant cannot expose another's data, but the operator is still Simson. |
| Separate AWS account | The same stack deployed in an account the journal or ACM owns. | That account's own free tier. | The journal wants its own operator. Electric MC only ships the stack. |

**Recommendation:** start the pilot as a **separate stack** in the sabinok
account, with the track's EICs agreeing in writing that Simson operates it,
and design the deployment so that moving it to an ACM-owned account later is
a redeploy plus a table export. A per-tenant customer-managed KMS key would
cost about $1 a month per key and is not needed for the pilot.

### 3.9 ACM peer-review policy

- No discussion text, title, abstract, author information or reviewer
  identity goes to any server-side LLM. The discussion feature has **no AI
  features at all** at first.
- Item 1 of the policy forbids uploading confidential material to
  third-party systems "that do not promise confidentiality". AWS's data-privacy
  terms say it does not access customer content without the customer's
  agreement, so storing the discussion there is defensible, but the operator question in 3.8 is the real
  confidentiality promise, and it should be put to the track's EICs and, if
  they want, ACM's publications staff before the pilot.
- No search index, embeddings or analytics are built over discussion text.

### 3.10 End-to-end encryption, later

The note-access thread deferred end-to-end encryption. It matters more here,
because it would take the operator out of the trust chain for message text.
A workable later design: each discussion has a symmetric key, wrapped for
each participant's device key; the server stores only ciphertext and still
enforces the access list. Costs: key management in an extension, lost
devices, and adding a late reviewer requires an existing participant's
device to wrap the key for them. It is worth revisiting if ACM or the EICs
object to operator access. It does not change the access model above.

### 3.11 Work required

| Piece | Size |
|-------|------|
| Tenant config, attestation, invitation and COI items; access check in `api` | Medium. Mostly the note-access design, with tenants. |
| Extension: "Sync AE assignments" on the EIC list page | Small to medium. One more page parser plus a confirm dialog. |
| Extension: "Open discussion" and invitation links on the AE page | Small to medium. Reviewer-list parser, local COI check. |
| Extension: discussion view on the Reviewer Center page, unread counts | Medium. The chat UI is shared with notes. |
| Cognito passwordless email OTP | Small. Pool setting plus a hosted login page. |
| Second stack and tenant onboarding runbook | Small. |
| Tests with synthetic CSCW-like fixtures (`XYZJ-` IDs, reviewer pages) | Medium. Needs captures from a reviewer and an EIC view, rewritten before commit. |

The parsers need sample pages from the other journal's Reviewer, AE and EIC
views. Those captures stay outside the repository (`var/`), and fixtures are
rewritten with synthetic data, as AGENTS.md requires.

---

## 4. Option B: Graffiti

### 4.1 What Graffiti is

From the UIST 2025 paper (version 2, August 2025) and the MIT News article:

- Applications are **client-side only**. They call a small TypeScript API
  (`login`, `put`, `patch`, `delete`, `get`, `discover`) and there is a Vue
  plugin on top. Developers write no server code.
- Every action is an **object** with a JSON `value`, a creator `actor`
  (a URI), a list of `channels`, and an optional **`allowed`** list of actor
  URIs. Only the creator can modify or delete an object.
- **Channels** are global strings. Anyone who knows a channel's name can read
  and write it, so channels give obscurity, not access control. The paper
  says so and notes that obscurity cannot revoke access.
- **`allowed` lists** are the access control. The server returns nothing
  for an object unless the reader is on its list.
- **Identity** is Solid OIDC. The paper notes that Solid OIDC is not widely
  deployed, and that one user can hold several actors (pseudonyms).
- **Hosting:** a "remote" implementation (a federation of NestJS and CouchDB
  servers in Docker; users pick a server or run their own), a planned
  "commodity storage" implementation on Solid pods with a tracker, and a
  local one for development.
- The paper states that **each server owner can see all objects and
  channels that pass through it**, that there is no end-to-end encryption
  yet, and that **login scopes** (limiting what an app may read) are future
  work. The MIT article calls it a research prototype whose security and
  privacy still need strengthening.
- `discover` streams results and `continue()` returns changes since the
  last call, so live updates come built in.

We have not read the Graffiti source code; this section is from the paper.
Check [graffiti.garden](https://graffiti.garden) for anything that has
changed since August 2025 before relying on it.

### 4.2 How reviewer discussion would map onto it

- One channel per manuscript, named with a long random string so it can't
  be guessed.
- Each post is an object whose `allowed` list holds the actor URIs of the
  AE, the reviewers and the EICs.
- Reviewers would each create a per-manuscript pseudonymous actor, so other
  reviewers do not see their main identity.
- The AE's client would publish the participant list as another object.

### 4.3 Where it falls short for confidential review

1. **Revocation and late joiners.** Only an object's creator can change its
   `allowed` list. When a reviewer is removed, or an EIC or a late reviewer
   must be added, **every earlier poster's client** has to come online and
   patch each of their objects. Our retroactive, role-based visibility (a
   design goal and a main differentiator) cannot be done by anyone with
   authority. A removed reviewer keeps access to everything already posted
   until each author patches it.
2. **Nobody can enforce retention.** Objects belong to their creators, so
   the journal cannot delete a discussion after the decision. Only the
   server operator could, outside the protocol.
3. **Who vouches for assignments.** Graffiti has no notion that a person is
   the AE of a manuscript. Section 2's chain of attestations would still be
   needed, and something would still have to bind a Solid identity to the
   address Manuscript Central uses, so we would write that logic anyway,
   in the client, where nobody can enforce it.
4. **Anonymity depends on every client behaving.** A reviewer's actor URI
   is on every object they create. If a reviewer's client posts under their
   main actor once, by mistake, other reviewers see their WebID, which
   often contains their name. The server cannot hide it, because the
   protocol defines the actor as visible.
5. **Any Graffiti app can read it.** Without login scopes, any Graffiti
   application a reviewer signs in to can read every object the reviewer is
   allowed to read, including review discussions. The paper names phishing
   by malicious apps as an open problem. Interoperability, Graffiti's main
   strength, is a risk for confidential material.
6. **Operator visibility is the same as Option A.** Server owners see all
   objects in plaintext. Using the research group's servers would put
   confidential review data on a third-party system with no confidentiality
   promise, which ACM policy item 1 forbids. So we would host our own
   server, which removes the "no backend" benefit.
7. **Hosting does not fit the free tier.** The remote implementation is a
   long-running NestJS and CouchDB container. It would need a small VM or
   container service (a few dollars a month at least, plus patching and
   backups), not Lambda and on-demand DynamoDB.
8. **Onboarding is harder.** Every reviewer would need a Solid identity
   from some provider, which few academics have, instead of an emailed code.
9. **Integration effort.** The extension uses Preact, not Vue, so it would
   use the core API directly. Solid OIDC inside an MV3 extension
   (`launchWebAuthFlow`, token storage in the service worker) is untested.
   The software is a research prototype that may change.

### 4.4 Where Graffiti would help

- No message-store code to write, and streaming updates built in.
- Users own their data and could carry it between apps.
- Good fit for **non-confidential** community features, for example a
  discussion among AEs about how to use Electric MC, or public reading
  groups. If Electric MC ever adds such a feature, Graffiti is worth a
  prototype.

---

## 5. Comparison

| Concern | Option A: Lambda + DynamoDB + Cognito | Option B: Graffiti |
|---------|----------------------------------------|--------------------|
| Who decides who may read | The server, from attestations by people with authority (EIC, handling AE) | Each poster's client, through the `allowed` list on each object |
| Adding a late reviewer or EIC | One attestation; they see the whole discussion | Every earlier poster must patch every object |
| Revoking access | Immediate, server-side | Only by each poster; obscurity cannot be revoked |
| Reviewer anonymity | Enforced by the server, which returns role labels only | Depends on every reviewer using a per-manuscript pseudonym correctly |
| Hiding from authors | Default deny plus COI markers | `allowed` lists, if every client sets them right |
| Conflicts of interest | Server-side block that overrides any grant | No protocol support |
| Retention | TTL deletion set by the journal | Creators own objects; journal cannot delete |
| Operator can read plaintext | Yes (whoever runs the AWS account) | Yes (whoever runs the Graffiti server) |
| Other apps reading the data | Only Electric MC's API | Any Graffiti app the reviewer signs in to (no login scopes yet) |
| Sign-in | Cognito, emailed one-time code | Solid OIDC; reviewers need a Solid identity |
| Learning assignments without the journal's email | Attestation chain (section 2), email Cc later | Same chain needed, enforced only in clients |
| Hosting | Free tier; fits existing design | Self-hosted container; not free tier |
| Live updates | 15 to 60 s polling, enough for review | Streaming built in |
| Maturity | Standard AWS services | Research prototype (per its authors) |
| New code for us | Medium (section 3.11) | Similar or more, plus Solid login and a server to run |
| ACM peer-review policy | Fits, with an operator agreement | Fits only with our own server and the same agreement |

**Recommendation: Option A.** It meets every requirement in section 1 with
the backend already designed, inside the free tier, and puts access,
anonymity, revocation and retention under control of the journal's EICs.
Graffiti's strengths (interoperability, user-owned data, no server) work
against confidential peer review, and its own authors list the missing
pieces (login scopes, encryption, hardened security) as future work.

---

## 6. Questions for the CSCW track's EICs

1. Should reviewers stay anonymous to each other after the decision, or may
   names be shown then?
2. Is CSCW review single- or double-blind for the purposes of this tool?
3. Can ACM staff add a Cc address to the AE-assignment and reviewer-agreed
   email templates on the track's Manuscript Central site (section 2.2)?
4. How long after the final decision should discussions be kept (default
   proposal 180 days)?
5. Do the EICs, and ACM if they want to involve it, accept Simson as the
   operator for a pilot, or should the stack run in an account they own?
6. Should reviewers keep read access after the decision?

---

## 7. Privacy decisions for doc/Privacy Policy.md

These are proposals. They go into the Privacy Policy when Simson approves
them.

- Reviewer discussions are stored in the backend with the author's Cognito
  identity; other reviewers see only "Reviewer *n*". The AE and the
  journal's EICs see who wrote each message.
- Reviewers cannot read the discussion until the handling AE opens it.
- Each journal (tenant) has its own EICs as admins. They can read only their
  own journal's discussions, and their reads are logged for the other EICs.
- Assignments for journals without an email feed come from attestations by
  the EIC (AE assignments) and the handling AE (reviewers). Each attestation
  is stored with who made it.
- Reviewer invitations store the invited email address for at most 14 days;
  it is deleted on acceptance.
- Author email addresses are compared with reviewer addresses only on the
  AE's computer and never sent to the server.
- Discussions are deleted automatically a set number of days after the final
  decision (proposed 180), and the journal's EICs can delete them sooner.
- Message times shown to reviewers are rounded to the hour.
- No AI features in reviewer discussions; no search index or embeddings over
  discussion text.
- Whoever operates the AWS account can technically read discussions. For a
  journal other than Simson's, that operator is named and agreed in writing
  before the journal's data is stored.
