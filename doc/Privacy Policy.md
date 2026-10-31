# Electric MC Privacy Policy

Status: draft, 2026-10-18. This page explains, in plain language, what
Electric MC collects, where it is kept, who can see it, and what it never
does. It is updated whenever a design decision changes any of this. The
technical details are in the design documents linked from each section.

## Current release

The Electric MC extension published today has **no backend**. It sends
nothing off your device and uses no analytics or tracking. It reads
Manuscript Central pages in your browser to restyle them and rename tabs.
Your settings are stored in `chrome.storage.sync`, so they follow your Chrome
profile. Page data and debug logs are stored in `chrome.storage.local`, in
that browser only, and leave it only if you export a log yourself. Test
builds can also append the log, in developer mode only, to a file on the
same computer through a helper you install yourself (`make
install-log-host`); nothing is sent anywhere else.
Manuscripts you haven't viewed in 2 years are removed from that storage
automatically, with your notes on them, and **Clear all data** in Settings
removes all of it at once (extension 0.0.30).

The one exception is **shared notes** (extension 0.0.40), and only if you
enter a notes server address in Settings. Without one, notes stay in your
browser as before. See section 5.1.

The rest of this page also covers **planned** features: the shared backend,
chat, activity tracking, AE recruitment, matching, and email (sections 4 to
10, and any mention of what "we store" or "the backend" does). None of them
is in the current release. This page will say when each one ships.

Electric MC is a Chrome extension for Manuscript Central (ScholarOne
Manuscripts) plus a small backend. The backend runs in the journal's own
Amazon Web Services account (us-east-2, Ohio). It isn't operated by
Clarivate, Silverchair, or any AI company.

## 1. The short version

- We store only what Electric MC needs to help editors run peer review:
  manuscript IDs, titles, statuses, who is assigned to what, chat messages,
  and (if you opt in) how long you worked on each manuscript.
- We never store manuscript files, email bodies, reviews, reviewer comments,
  or author email addresses.
- **No manuscript, author, or reviewer information is ever sent to an AI or
  LLM service.** Any AI analysis runs on your own computer.
- Activity tracking is off unless you turn it on, and you can see and delete
  your own records.
- For now, every automatic email Electric MC sends goes to one person, the
  journal's co-chair (currently Simson).

## 2. Who this covers

| Person | What we hold about them |
|--------|-------------------------|
| Editors, AEs, staff who use Electric MC | Name, email address(es), journal roles, assignments, chat messages they write, and opt-in activity records |
| Reviewers | Their assignment to a manuscript, invitation and due dates, and (later, if they use the extension) their chat messages. Reviewer identity is hidden from authors and, on double-blind journals, follows the journal's blind-review settings. |
| Authors | Only what identifies the manuscript: its ID and title, and the submitting author's surname from the assignment email. **No author email addresses.** |
| Prospective AEs | See section 7. |

## 3. What the extension reads in your browser

The extension runs only on `*.manuscriptcentral.com` pages. Unless you
turn it off for a site, it:

- reads the page to find the manuscript ID, title, status, and the people
  assigned, so it can show the right chat and rename the browser tab (the tab
  title rewrite makes your browser history readable);
- restyles the page. Styling rules are data, never remote code;
- reads the Assign Associate Editor pull-down when it is on the page, and
  keeps each editor's name and current number of assigned manuscripts, the
  latest reading only, for the editorial matrix (extension 0.0.32);
- (planned) if you opt in, notes when the tab is visible and you are active (mouse,
  keyboard, focus, Chrome idle state). It never records keystrokes, page
  content, or screenshots.

**Debug logs** stay on your computer. The side panel can export them to your
Downloads folder. The *redacted* export replaces manuscript IDs with hashes
and drops names, titles, email addresses and URL query strings, so it is
safe to send to the developers. The *full* export is for your own use only.

**Preferences sync** through your Chrome profile (`chrome.storage.sync`), so
they follow you to other computers where you are signed in to Chrome. They
are only feature switches, layout options, and the list of Manuscript
Central sites where you turned the extension off. No manuscript data is
synced: page data and logs stay in `chrome.storage.local`, in that browser
only.

**The editorial matrix's roster** (names, roles, affiliations, public
contact links and headshots of the section's editors) is not part of the
extension. You load it from a file, and it is kept in `chrome.storage.local`
in that browser only, like the AE counts. Clear all data removes both.

**Suggested AEs** (extension 0.0.43). On a manuscript page, the side panel
reads the title, abstract and keywords, turns them into an embedding vector
with the model bundled in the extension, compares it with the AE profiles
you loaded, and shows the ranking. The abstract and the vector are kept only
in memory while the panel shows that manuscript: they are not stored, logged
or sent anywhere. The AE profiles file (each AE's name, expertise keywords,
titles and years of up to 20 recent papers, and vectors made from their
public papers) is built on your own computer by `make ae-profiles`, which
fetches public records from OpenAlex and DBLP by AE name, ORCID or DBLP id;
no manuscript data is part of that. The file is kept in
`chrome.storage.local` in that browser only. Clear all data removes it.

**The To EIC list and your roles.** The extension keeps, in
`chrome.storage.local` only, each recommendation you sent to the EIC
(manuscript ID, title, the recommendation, and when it was first seen) and
which MC roles you have. It never keeps your comments to the EIC or the
author. Items leave the list when the EIC acts; Clear all data removes the
list and the roles.

Details: [Technical Stack and Architecture.md](planning/Technical%20Stack%20and%20Architecture.md)
sections 2 and 6.

## 4. Notification emails

Manuscript Central's notification emails to the co-chair mailbox are passed
to the backend (Amazon SES, then a Lambda function). From each email we
**extract a few fields** (manuscript ID, title, status, who was assigned,
due dates, decision type, plagiarism-check percentage) and **discard the
rest**:

- the email body, personal notes, reviewer comments, and attachments are
  never stored;
- account, password-reset and one-time-code emails are deleted at once,
  never stored, logged or forwarded;
- the raw message is deleted from temporary storage right after it has been
  processed;
- a small processing log (message ID, type, result) is kept for 90 days to
  avoid processing the same email twice.

Details: [Email ingestion.md](planning/Email%20ingestion.md).

## 5. Chat

Chat messages are stored in the backend with their author and a visibility
setting (for example "handling AE and EiC only"). The server enforces
visibility, so you only ever receive messages meant for a role you hold.
When a message's visibility is changed later, the change is logged with who
made it. Messages are capped at 2 KB. How long they are kept after a final
decision is still to be decided (Design Goals open question 9).

## 5.1 Notes (extension 0.0.40)

Each note on a manuscript is signed with its author's name and the time its
editing session began.

**Who you are.** The extension reads who is logged in from information MC
puts in its own pages: your MC email, first and last name, MC person number
and role type. The first time you write a note, it asks for the name you
want on notes. If that name differs from MC's, notes show both, like "Pat
Example (Opinions Co-Chair)". Your name is kept in your Chrome profile's
synced settings, and the MC details in this browser's local storage.

**Without a notes server** (the default), notes stay in this browser.

**With a notes server** set in Settings, the extension sends the server:
- once per browser, a public key it made for you, with your MC email, MC
  name, person number, role type, journal and the name you chose. The
  matching private key can't be exported and never leaves the browser.
  You may have several keys (one per browser profile);
- for each note: the manuscript's base ID, the session time, the text and
  when it was last edited. The server records the author from your key,
  not from anything the request says;
- with every request, a SHA-256 hash of the manuscript's title. **The title
  itself is never sent or stored.** The server keeps only an HMAC (a keyed
  hash, with a secret only the server knows) of the ID and that hash, to
  check that later requests are about the same paper.

The server lets you edit and delete your own notes. Co-chairs and the EIC
can delete anyone's. The project owner can ban a key or an email, and a
banned key can't send anything more. Notes sent to the server stay there
until they are deleted; Clear all data removes only this browser's copy.

**Current limit.** For now, the first upload of a key is taken as
legitimate. Anyone could register a key with someone else's MC details, and
the person who knows a paper's ID and exact title (including its authors)
can read its notes. Until the owner approves identities, use the notes
server only for notes that wouldn't harm anyone if read. Approval and
per-assignment visibility come later (sections 5 and 10).

## 6. Activity tracking (opt-in)

If you opt in, the extension records sessions: which manuscript, when, and
how many seconds you were active. You can see your own history and delete
it. By default it is visible to you, the EiC, and staff admins. Sessions are
deleted automatically after one year.

## 7. AE recruitment

When the journal approaches someone about becoming an associate editor,
Electric MC keeps:

- their name, email, affiliation, ORCID iD, DBLP and Google Scholar
  identifiers, who suggested them, a short staff note (1 KB maximum), and
  where the invitation stands (contacted, followed up, accepted, declined);
- an **expertise profile** built from their **public** publication list. It
  comes from DBLP, ORCID and OpenAlex. Google Scholar is used only when a
  staff member opens the person's Scholar page themselves; we never fetch
  Scholar automatically.

Records of people who declined or never answered are kept for 2 years, so
we don't ask the same person again too soon, and are then deleted
automatically. Anyone can ask to have their record deleted sooner. People
who accept become regular users (section 2).

Invitations may list **titles** of open submissions the person would be well
suited to handle, never author names, manuscript IDs, or abstracts. A
journal can turn this off (`showTitlesToProspects`), and a person reviews
every invitation before it is sent.

Details: [AE recruitment and matching.md](planning/AE%20recruitment%20and%20matching.md).

## 8. AI and matching

The following were decided by Simson on 2026-10-18, following the
[ACM Peer Review Policy](https://www.acm.org/publications/policies/peer-review).
Item 1 of that policy forbids uploading confidential submissions, authors'
technical approaches, or information about authors into third-party
systems, including LLMs, that do not promise confidentiality.

- **Matching manuscripts to AEs uses no LLM.** It compares numeric
  "embedding" vectors made from titles and abstracts. The model that makes
  them is **bundled inside the extension and runs on your computer**. The
  manuscript's text never leaves your computer for this purpose. The
  resulting vector is stored in our backend under the same access rules as
  the manuscript's title. The abstract itself is not stored. (In extension
  0.0.43 there is no backend yet: the vector isn't stored at all, and AE
  profiles are a file you load; see section 3.)
- **Optional writing help** (for example, drafting an invitation) uses only
  the **on-device** model built into Chrome, where your computer supports it.
- **We never send manuscript titles, abstracts, author names, reviewer
  information, or anything about a submission to a server-side AI service**
  (Gemini, Claude, ChatGPT or others). If a server-side model is ever used
  for text that contains none of this, it will be off by default, switchable
  per journal, capped by a monthly spending limit, and listed here first.
- Apple Intelligence may be supported later through a small Mac helper app.
  It also runs on-device.

## 9. Emails Electric MC sends

Electric MC sends a daily digest of reminders and alerts (follow-ups due,
overdue items, plagiarism threshold exceeded). **For now, every such email
goes only to the co-chair** (currently Simson), even when it is about someone
else's task. That person is named in the email. Direct delivery to other
staff will be switched on later, and this page will say so.

## 10. Where data is kept and who runs it

- Amazon Web Services, account controlled by the journal's Electric MC
  administrators, region us-east-2 (Ohio, USA).
- DynamoDB (data), Cognito (sign-in), Lambda (code), SES (email), S3
  (temporary email storage only).
- Data is encrypted at rest (AWS defaults) and in transit (HTTPS).
- Sign-in is through Amazon Cognito. Electric MC never sees your Manuscript
  Central password.
- No advertising, analytics, or tracking services are used, and no data is
  sold or shared.

## 11. Your choices

- Turn the extension off for any site from its toolbar icon (planned; requested 2026-10-18).
- Opt in or out of activity tracking at any time, and delete your history.
- Ask the co-chair to correct or delete what Electric MC holds about you.

## 12. Change log

| Date | Change |
|------|--------|
| 2026-10-18 | First draft. Added AE recruitment, on-device-only AI and vector matching, and co-chair-only emails. Preferences sync through the Chrome profile (extension 0.2.6); manuscript data stays local. |
| 2026-10-19 | Added "Current release": the published extension has no backend and sends nothing off the device. |
| 2026-10-22 | Local manuscript data (Seen list and its notes) is removed after 2 years without a view; added Clear all data (extension 0.0.30). |
| 2026-10-23 | The editorial matrix: AE assignment counts read from MC's pull-down, and a roster loaded from a file, both kept in local storage only; Clear all data removes them (extension 0.0.32). |
| 2026-10-24 | The To EIC list (your recommendations, without comments) and the MC roles you have, kept in local storage only; Clear all data removes them (extension 0.0.33). |
| 2026-10-27 | Test builds in developer mode can append the log to a local file through a helper the user installs (native messaging; not in the Web Store build) (extension 0.0.34). |
| 2026-10-28 | Authored notes (section 5.1): the extension reads the logged-in person from MC's page metadata; with a notes server set, notes, a public key per browser and the person's MC details go to the server; titles never leave the browser, only a hash, which the server stores as an HMAC (extension 0.0.40). |
| 2026-10-28 | Suggested AEs: the manuscript is embedded on-device and not stored; AE profiles are built locally from public OpenAlex and DBLP data and kept in local storage only; Clear all data removes them (extension 0.0.43). |
