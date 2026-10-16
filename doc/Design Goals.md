# Electric MC: Design Goals

Status: draft, 2026-10-16. This document sets the requirements for the first
phases of development. Decisions still open are listed in
[Open questions](#11-open-questions) at the end.

Related documents:

- [Ideas from the web.md](Ideas%20from%20the%20web.md): complaints about
  Manuscript Central found online that this architecture could address.
- [publicity.md](publicity.md): where Manuscript Central users gather.
- [ScholarOne release history.md](ScholarOne%20release%20history.md): what
  the vendor shipped in 2024–2026 and what it is likely to ship next.

## 1. Purpose

Electric MC makes Manuscript Central easier to use for the people who run a
journal's peer review: associate editors (AEs), editors, assigning editors,
the editor in chief (EiC), and editorial staff. Reviewers are a secondary
audience.

Manuscript Central is the editor-facing name of **ScholarOne Manuscripts**,
sold by Clarivate until Silverchair acquired it (announced 2024-10-28). Sites
live at `https://mc.manuscriptcentral.com/<journal>` and on numbered hosts such
as `mc04.manuscriptcentral.com`.

Electric MC does not replace or modify Manuscript Central. It is:

1. a **Chrome extension** that restyles Manuscript Central pages, adds a chat
   panel per manuscript, and (opt-in) records how long people work on each
   manuscript; and
2. a small **AWS backend** (Lambda, DynamoDB, Cognito) that stores chat
   messages, people and roles, and activity records, and serves a dashboard.

## 2. Goals, in priority order

| # | Goal | Summary |
|---|------|---------|
| G1 | Readability | Restyle key parts of Manuscript Central so pages are easier to read and scan. |
| G2 | Per-manuscript chat | A chat panel beside each manuscript, with per-message visibility that can be changed after posting. |
| G3 | Opt-in activity tracking | Record when editors view each manuscript and how long they actively work on it. |
| G4 | Attention dashboard | A server-rendered, sortable list of manuscripts that have received no (or little) attention. |
| G5 | Free-tier operation | The whole backend runs inside the AWS always-free tier for Lambda and DynamoDB. |

Non-goals for now: changing anything stored in Manuscript Central, automating
Manuscript Central actions (inviting reviewers, making decisions), author-side
features, and mobile browsers.

## 3. Users and roles

The chat visibility model uses these roles. A person can hold several roles,
and roles are relative to a manuscript where noted.

| Role | Scope | Meaning |
|------|-------|---------|
| Reviewer | per manuscript | A reviewer assigned to this manuscript. |
| Handling AE | per manuscript | The associate editor handling this manuscript ("the associate editor involved"). |
| All AEs | journal | Every associate editor of the journal. |
| Editor | per manuscript | The editor responsible for this manuscript. |
| Assigning editor | per manuscript | The editor who assigned the manuscript to the handling AE. |
| EiC | journal | The editor in chief. |
| Staff | journal | Editorial office staff and administrators of Electric MC. |

**Initial configuration is static.** People, their roles, and their
per-manuscript assignments live in DynamoDB and are loaded by an admin script
(for example from a YAML or CSV file in a private repository). A later phase
may learn assignments from the Manuscript Central pages a user views (see
section 9.3), but the static table is the source of truth for permissions.

Identity: each person signs in with Amazon Cognito (a user pool with email
sign-in; institutional SSO through a Cognito identity provider is a later
option). The Cognito `sub` is the person's key in DynamoDB. Their Manuscript
Central identity is matched by email address in the static configuration.

## 4. Architecture

```
 Chrome (Manifest V3 extension)                         AWS (one region)
 ┌──────────────────────────────────────────┐        ┌───────────────────────────┐
 │ content script on *.manuscriptcentral.com│        │ Cognito user pool         │
 │  - detects current manuscript ID         │        │  (sign-in, JWTs)          │
 │  - injects restyling CSS                 │        └────────────┬──────────────┘
 │  - activity sensing (mouse, focus)       │                     │ JWT
 │ service worker (background)              │  HTTPS  ┌───────────▼──────────────┐
 │  - auth tokens, API calls, batching      ├────────►│ Lambda function URL: API │
 │  - chrome.idle, chrome.windows focus     │         │  (Rust, cargo-lambda)    │
 │ side panel (chrome.sidePanel)  ◄──┐      │         └───────────┬──────────────┘
 │ pop-out window (chrome.windows)  ─┘ chat │                     │
 └──────────────────────────────────────────┘         ┌───────────▼──────────────┐
                                                      │ DynamoDB, single table,  │
 Browser ── HTTPS ──► Lambda function URL: dashboard ─►│ provisioned capacity     │
                       (Rust + minijinja templates)    └──────────────────────────┘
```

### 4.1 Extension

- Manifest V3, written as a standard WebExtension so that Edge (same engine)
  is free and Firefox is cheap later. Chrome is the only supported browser for
  now.
- Host permissions limited to `https://*.manuscriptcentral.com/*` and the
  backend's own URLs.
- Components:
  - **Content script** on Manuscript Central pages: finds the manuscript being
    viewed, applies restyling, and senses user activity.
  - **Service worker**: holds the Cognito session, talks to the backend,
    batches and retries writes, and tracks which tab and window are focused.
  - **Chat UI**: one web page used in two places, the Chrome side panel and a
    pop-out window (see 6.4).
  - **Options page**: sign-in, restyling preferences, activity-tracking opt-in.
- **Language: TypeScript** (decided by Simson, 2026-10-16).
- **Proposed stack** (recommended, not yet confirmed):
  - WXT (Vite-based extension framework) to build Manifest V3 for Chrome, with
    Edge and Firefox builds available from the same code;
  - Preact for the chat UI and options page (small bundle);
  - restyling as plain CSS injected into Manuscript Central pages, with any
    UI Electric MC adds to those pages (badges, buttons) rendered inside a
    Shadow DOM so the page's styles and ours cannot interfere;
  - API types generated from the Rust backend (`ts-rs` or an OpenAPI schema)
    so the extension and Lambda agree on request shapes;
  - Vitest for unit tests and Playwright (with the extension loaded) for
    end-to-end tests against saved copies of Manuscript Central pages.

### 4.2 Backend

- **Language: Rust** for all Lambda functions, built with `cargo-lambda` and the
  `lambda_runtime` crate, for fast cold starts and low memory (decided by
  Simson, 2026-10-16). Lambdas run on arm64 (Graviton) at 128 MB unless
  measurement shows a need for more.
- **Lambda function URLs** front the Lambdas instead of API Gateway, because
  function URLs are free and API Gateway's free tier lasts only 12 months.
  Each request carries a Cognito JWT that the Lambda verifies itself (JWKS
  fetched once per container and cached).
- **Two functions** to start: `api` (JSON API for the extension) and
  `dashboard` (HTML pages). They share one Rust crate for the data layer.
- **DynamoDB**: one table, provisioned capacity (see section 8).
- **Cognito**: one user pool; the extension uses the authorization-code flow
  with PKCE through `chrome.identity.launchWebAuthFlow`. The dashboard uses the
  Cognito hosted login page and a secure, HTTP-only session cookie.
- **Infrastructure as code**: AWS SAM or CDK, chosen when we start the backend.

## 5. G1: Readability and restyling

Manuscript Central's editor pages are dense tables of small text, with legacy
layouts that predate current accessibility practice (Silverchair says its
accessibility remediation so far covered only the author submission path;
see Ideas from the web).

Requirements:

1. The extension injects CSS into Manuscript Central pages to restyle a
   defined set of **key items**. Initial targets:
   - manuscript ID, title, and status in lists and headers;
   - the editor's queues and task lists (larger type, zebra striping,
     sticky header row);
   - due and overdue dates (colour-coded: due soon, overdue);
   - reviewer status lists (colour-coded by invited, agreed, declined,
     overdue, complete);
   - long text blocks such as abstracts and reviewer comments (readable line
     length and line spacing).
2. Restyling rules are **data, not code**: each rule is a CSS selector plus a
   style, grouped into named themes. Rules ship with the extension and can be
   updated from the backend without a new extension release, because
   Manuscript Central's markup differs between journals and will change as
   Silverchair rolls out new editor pages.
3. Each user can turn restyling on or off, choose a theme, and set a base font
   size. Preferences sync through `chrome.storage.sync`.
4. Restyling must never hide or change information or controls. It may add
   visual markers (badges, colours) and may reorder nothing.
5. A per-journal configuration maps page types (dashboard, manuscript details,
   reviewer list, and so on) to their selectors, so one extension supports
   many journals.
6. An accessibility theme (high contrast, larger type, visible focus outline)
   is part of the first release.

## 6. G2: Per-manuscript chat

### 6.1 What it is

A chat thread attached to each manuscript, shown in a panel on the right of
the browser. People use it for the notes and discussion that Manuscript
Central makes hard to keep and hard to restrict.

### 6.2 Manuscript identity

- The content script reads the manuscript ID from the page (Manuscript
  Central shows IDs such as `JOURNAL-2026-0123` and revision suffixes such as
  `.R1`).
- All revisions of a manuscript share one thread: the thread key is the base
  ID with the revision suffix removed. Each message records which revision was
  current when it was posted.
- A rejected-and-resubmitted manuscript gets a new ID in Manuscript Central.
  Staff can link the two IDs so that the new thread shows the old one's
  history (later phase).
- The thread key also includes the journal (site) so IDs never collide across
  journals.

### 6.3 Following the current manuscript

- The chat panel always shows the thread for the manuscript in the focused
  Manuscript Central tab. When the user navigates to another manuscript, or
  switches to a tab showing another manuscript, the panel switches threads.
- If the focused tab shows no manuscript (for example a queue page), the panel
  shows the most recent thread and a list of recently viewed manuscripts.
- The user can pin the panel to one manuscript to stop it following.

### 6.4 Side panel and pop-out window

- The chat appears in the Chrome **side panel** (`chrome.sidePanel`) by
  default.
- A **pop-out** button in the side panel opens the chat in its own window
  (`chrome.windows.create`, type `popup`) and closes the side panel.
- A **pop-in** button in the pop-out window returns the chat to the side
  panel and closes the window.
- Both views are the same page and follow the current manuscript the same
  way. Position and size of the pop-out window are remembered.
- Draft text survives pop-out and pop-in.

### 6.5 Visibility

Every message has a **visibility set**: one or more of the audiences below.

- Reviewers (of this manuscript)
- The handling AE
- All AEs
- The editor
- The assigning editor
- The EiC

Rules:

1. The author always sees their own messages.
2. Staff with the admin role see everything (needed for support and audits).
3. When composing, the user picks the visibility set from checkboxes. The
   default is the user's last choice for this journal; the first-time default
   is "handling AE, editor, assigning editor, EiC" (everyone except reviewers
   and the wider AE pool).
4. **Retroactive change**: a message's visibility can be changed after it is
   posted. By default only the message's author and the EiC can change it
   (open question 2). Narrowing visibility removes the message from other
   people's views at their next refresh; anything they already read cannot be
   recalled, and the UI says so.
5. **Bulk change**: the author or EiC can change the visibility of all
   messages in a thread, or all of their own messages in a thread, at once.
6. Every visibility change is recorded (who, when, from, to) and shown to
   people who can see the message.
7. Each message shows its current audience as small badges so nobody has to
   guess who can read it.
8. **Reviewer safety**: reviewers never see the names of other reviewers or
   of editors whose identity the journal keeps confidential. Messages visible
   to reviewers show role labels ("Associate Editor") rather than names when
   the journal is configured for blind review. Reviewer messages show to
   editors with the reviewer's name and to other reviewers as "Reviewer 1",
   "Reviewer 2" (matching Manuscript Central's numbering).
9. Permission checks happen on the server. The extension never receives a
   message the user is not allowed to see.

### 6.6 Message features (first release)

- Plain text with simple formatting (links, bold, italics, lists).
- Edit and delete own messages (edits are recorded and marked "edited").
- Timestamps in the reader's time zone.
- Unread count per thread, shown as a badge on the extension icon for the
  current manuscript.

Later: mentions with email notification, attachments (stored in S3, which
needs its own free-tier check), reactions, and search.

### 6.7 Updates without a WebSocket

API Gateway WebSockets are not free after 12 months, so the chat **polls**.
To keep polls cheap:

- Each thread has a small "head" item holding a version counter that
  increments on every new message, edit, or visibility change. A poll is one
  `GetItem` on that head (0.5 read capacity units, eventually consistent);
  messages are fetched only if the version changed.
- The client polls only while the chat is visible: every 15 s while the user
  is active, every 60 s when the window is unfocused, and not at all when the
  computer is idle or the panel is closed. Posting a message triggers an
  immediate refresh.
- One poll request can cover all threads the user has open (batched), so
  multiple tabs cost one request.

## 7. G3: Opt-in activity tracking

### 7.1 Consent

- Off by default. A user turns it on in the options page after reading a
  short statement of what is recorded, who can see it, and how long it is
  kept. They can turn it off and delete their history at any time.
- Tracking only covers Manuscript Central pages; no other browsing is
  recorded.

### 7.2 What counts as "working on" a manuscript

A user is counted as **actively working** on manuscript M during an interval
when all of the following hold:

1. the focused tab in the focused Chrome window shows a Manuscript Central
   page for M, or the chat panel for M is focused;
2. the page is visible (`document.visibilityState === "visible"`) and has
   focus (`document.hasFocus()`);
3. the computer is not idle or locked (`chrome.idle`, with a 60-second
   detection interval); and
4. there has been mouse movement, scrolling, or keyboard input in that window
   within the last 60 seconds.

Viewing a manuscript's PDF (which Manuscript Central opens in a separate
window or tab) counts as working on that manuscript when the extension can
tell which manuscript the PDF belongs to.

### 7.3 What is recorded

- **Views**: each time a user opens a manuscript (timestamp, manuscript,
  page type).
- **Work sessions**: start time, end time, and active seconds per
  manuscript, merged so that gaps shorter than 5 minutes join one session.

The extension accumulates activity locally and uploads one batch every 5
minutes (and when the browser goes idle), so tracking costs a handful of
writes per user per hour.

### 7.4 Who sees it

- The user always sees their own history.
- By default the EiC and staff admins can see everyone's history (open
  question 4). The dashboard uses aggregated figures ("last touched", "total
  active time") for its attention list.
- Records are kept for one year by default, then expire through a DynamoDB
  TTL attribute (deletion by TTL is free).

## 8. G5: Free-tier budget and efficiency

The backend must stay inside the AWS **always-free** allowances (not the
12-month introductory ones):

| Service | Always-free allowance (per month) | How we stay inside it |
|---------|-----------------------------------|------------------------|
| Lambda | 1,000,000 requests and 400,000 GB-seconds | Rust on arm64 at 128 MB; polling only while visible; batched writes. |
| DynamoDB | 25 GB storage, 25 provisioned RCU and 25 WCU | One table in **provisioned** mode (on-demand is not covered by the always-free tier); small items; GSIs counted against the same budget. |
| Cognito | 10,000 monthly active users on the Lite/Essentials tier (check current pricing at build time) | Far below need. |
| Lambda function URLs | No extra charge | Used instead of API Gateway. |
| CloudWatch Logs | 5 GB ingestion | Log errors and summaries, not every request. |

AWS changes these terms; verify them before launch and record the date
checked.

Rough request budget, assuming 30 active users working 6 hours on 22 days a
month with the chat visible half that time:

- chat polls at about 4 per minute while visible: 30 × 3 h × 60 × 4 × 22 ≈
  475,000 requests;
- activity uploads every 5 minutes: 30 × 6 × 12 × 22 ≈ 48,000;
- messages, page loads, and dashboard views: well under 50,000.

That totals roughly 575,000 Lambda requests a month, inside the 1,000,000
allowance with room for growth. Above about 50 heavy users we would lengthen
poll intervals or add a cheap "anything new?" check served from a cache.

Efficiency rules for all code:

- One table, designed around access patterns (below); no scans in request
  paths.
- Eventually consistent reads unless correctness needs a strong read.
- Batch reads (`BatchGetItem`) and writes (`BatchWriteItem`) where possible.
- Keep items under 1 KB where possible so each write is one WCU.
- Every endpoint documents its expected read and write cost.

### 8.1 DynamoDB single-table sketch

| Item | PK | SK | Notes |
|------|----|----|-------|
| Person | `PERSON#<sub>` | `PROFILE` | name, email, journals, global roles |
| Journal config | `JOURNAL#<site>` | `CONFIG` | blind-review settings, selectors version |
| Role on manuscript | `MS#<site>#<baseId>` | `ROLE#<role>#<sub>` | static assignments (reviewer, handling AE, editor, assigning editor) |
| Thread head | `MS#<site>#<baseId>` | `HEAD` | version counter, last message time, title |
| Message | `MS#<site>#<baseId>` | `MSG#<ulid>` | author, body, visibility set, revision, edit history pointer |
| Visibility change | `MS#<site>#<baseId>` | `VIS#<ulid>#<ts>` | audit trail |
| Activity session | `ACT#<sub>` | `<ts>#<site>#<baseId>` | active seconds, TTL |
| Manuscript attention | `MS#<site>#<baseId>` | `ATTN` | last viewed, last worked, total active seconds (updated on upload) |

A GSI keyed by `JOURNAL#<site>` and "last attention" time supports the
dashboard's attention list without a scan.

## 9. G4: Attention dashboard

### 9.1 What it shows

A web page, served by the `dashboard` Lambda, listing manuscripts that have
received no or little attention. Columns:

- manuscript ID and title (linking to the manuscript in Manuscript Central);
- status and handling AE, editor, assigning editor;
- days since submission or since the last status change;
- last viewed (by anyone with an editor role) and by whom;
- total active working time;
- last chat message;
- an "attention" flag: never viewed, not viewed in N days, or viewed but
  with under M minutes of work (thresholds configurable per journal).

The list is **sortable** by any column and filterable by journal, role, and
flag. Sorting and filtering work with query parameters (server-side) so the
page needs no JavaScript; a small script may add click-to-sort on top.

### 9.2 How it is built

- Rust, with **minijinja** templates (Jinja2-compatible syntax), compiled into
  the Lambda binary.
- Access requires a Cognito login; who can see which journals follows the
  same roles as chat (EiC, editors, and staff by default).
- Pages are small, server-rendered HTML with one stylesheet; no front-end
  framework.

### 9.3 Where the manuscript list comes from

Electric MC cannot query Manuscript Central directly unless the publisher
grants API access. The list of manuscripts therefore comes from:

1. the static configuration (staff upload a manuscript list and assignments
   exported from Manuscript Central reports); and, later,
2. what the extension sees: when an editor opens a queue page, the extension
   can send the IDs, titles, and statuses on that page to the backend.

Manuscripts known to exist but with no view or work records are the ones the
dashboard flags as having received no attention.

## 10. Security and privacy

- Manuscripts under review are confidential. The backend stores only IDs,
  titles, statuses, role assignments, chat text, and activity times; it never
  stores manuscript files.
- All data is encrypted at rest (DynamoDB default) and in transit (HTTPS).
- The extension requests the narrowest permissions it can and contains no
  remote code; restyling rules fetched from the backend are data (selectors
  and style properties), validated before use.
- Reviewer anonymity and blind-review settings are enforced on the server
  (section 6.5 rule 8).
- Activity tracking is opt-in, visible to the user, and deletable.
- Before deployment for a real journal, confirm that the publisher and
  Silverchair's terms permit a browser extension that reads Manuscript Central
  pages and stores notes outside the system (open question 6).

## 11. Open questions

These were asked in the project thread on 2026-10-16; the defaults below
apply until answered.

1. **Which journals first?** Default: any `*.manuscriptcentral.com` site, with
   per-journal configuration; we need one pilot journal to tune selectors.
2. **Who can change a message's visibility after posting?** Default: the
   message's author and the EiC.
3. **Do reviewers install the extension?** Default: yes eventually, but the
   first release targets editors and staff; reviewer access comes later.
4. **Who can see activity records?** Default: the user, the EiC, and staff
   admins.
5. **Browsers**: default Chrome first, written so Edge and Firefox are cheap.
6. **Terms of use**: does the publisher's ScholarOne contract allow this
   extension, and will the publisher grant ScholarOne API access (which now
   includes calls such as `addNote` and `makeEditorAssignment`, added
   2025-11-26) so we can read assignments instead of configuring them?
7. **Overlap with the vendor**: Silverchair is testing "in-workflow
   collaboration tools" and new editor dashboards in 2026 (see the release
   history). Should Electric MC sync its notes into ScholarOne notes through
   the API when available, or stay independent?
8. **Blind review settings**: which journals are single-blind and which are
   double-blind, and which editor identities are hidden from reviewers?
9. **Retention**: how long should chat messages be kept after a final
   decision?

## 12. Suggested milestones

1. **M0 – Skeleton**: extension that detects manuscript IDs on a pilot
   journal; Cognito sign-in; Rust `api` Lambda with a health check;
   DynamoDB table; deployment scripts.
2. **M1 – Readability (G1)**: restyling rules and themes, per-journal
   selectors, options page.
3. **M2 – Chat (G2)**: side panel and pop-out, threads that follow the
   current manuscript, visibility sets and retroactive changes, polling.
4. **M3 – Activity (G3)**: opt-in, sensing, batching, own-history view.
5. **M4 – Dashboard (G4)**: Rust and minijinja attention list with sorting
   and filters.
6. **M5 – Hardening**: load test against the free-tier budget, security
   review, pilot with real editors.
