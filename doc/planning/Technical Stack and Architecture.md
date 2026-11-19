# Electric MC: Technical Stack and Architecture

Status: approved by Simson on 2026-10-16. That covers the extension stack, the
Rust backend, Lambda function URLs, polling chat, and DynamoDB. DynamoDB uses
on-demand capacity; Simson decided on 2026-10-18 not to pre-allocate RCU and
WCU. The requirements this design serves are in
[Design Goals.md](Design%20Goals.md); section references such as "Goals 6.4"
point there.

**Superseded in part (2026-10-31):** Cognito is dropped. Sign-in, the JWTs
and the `<sub>` keys below are replaced by signed requests and email-approved
keys, and notes are end-to-end encrypted, as described in
[End-to-end note encryption.md](End-to-end%20note%20encryption.md). The
backend URL becomes `https://emc-api.sabinok.com` (CloudFront in front of the
function URL). The rest of this document still applies.

## 1. Overview

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
 └──────────────────────────────────────────┘          ┌──────────▼───────────────┐
                                                       │ DynamoDB, single table,  │
 Browser ── HTTPS ──► Lambda function URL: dashboard ─►│ on-demand capacity       │
                       (Rust + minijinja templates)    └──────────────────────────┘
```

## 2. Browser extension

This section describes the extension as built (updated 2026-11-20, after the
2026-11-19 system audit in `doc/audits/`). Planned parts are marked.

### 2.1 Stack

- **Language:** TypeScript (`tsgo`, TypeScript 7), strict, with no unused
  locals or parameters. ESLint with type-aware rules runs from its own
  package, `extension/tools/lint`.
- **Build:** WXT, a Vite-based extension framework, building Manifest V3 for
  Chrome. Two flavors: the Web Store build, and a test build that adds
  `nativeMessaging` (the live log) and `declarativeNetRequestWithHostAccess`
  (Back-button caching). `permissions.json` lists what each may ask for, and
  `scripts/check-permissions.mjs` and `scripts/check-no-remote-code.mjs` run
  after every build.
- **UI:** Preact for the side panel (one panel per MC tab) and the pop-out
  windows (matrix, team editor). Settings live in the side panel's Settings
  tab; there is no options page.
- **On MC pages:** restyling is inline styles and small elements added to
  MC's own DOM, marked `data-electric-mc` and styled with `!important` so
  MC's CSS can't override them. Only the developer-mode debug badge is in a
  Shadow DOM.
- **Page clicks:** MC's links are `javascript:` URLs that the content
  script's isolated world can't run, so a small MAIN-world script
  (`entrypoints/page-click.content.ts`, `lib/click.ts`) presses them.
- **Activity sensing:** keyboard and mouse events in MC tabs, shared through
  `chrome.storage.local`, for the keepalive (`lib/keepalive.ts`). No
  `chrome.idle` and no `idle` permission. Opt-in time tracking is planned.
- **Tests:** Vitest with jsdom over `lib/` and `parsers/`, on synthetic page
  fixtures, with a coverage floor. Local-only tests on real MC data in the
  git-ignored `var/` (`tests-real/`, `npm run test:real`), fed by weekly page
  samples from test builds (`lib/pagesample.ts`). `tools/e2e/load-check.mjs`
  only checks that the build loads in Chromium; there are no end-to-end tests
  against MC pages yet.
- **API types:** written by hand on both sides (`lib/notesClient.ts`,
  `backend/notes`). Generated types (`ts-rs` or OpenAPI) are planned.

### 2.2 Components

- **Content script** (`entrypoints/content.ts`) on Manuscript Central pages.
  It parses each page (`parsers/`), restyles it, and runs the page features
  (`lib/`). It sends what it learns to the service worker.
- **Service worker** (`entrypoints/background.ts`). It keeps each tab's latest
  parse (session storage), the log, the Seen index and what content scripts
  learn, writing storage through one queue. In test builds it also feeds the
  live-log helper. It holds no sign-in session: Cognito was dropped, and the
  notes server authenticates each request by a signature from the browser's
  own key (`lib/notesClient.ts`).
- **Side panel** (`entrypoints/sidepanel/`). The parse, notes, queues,
  Suggested AEs, the log and Settings. The notes server is called from here.
- **Pop-outs.** The editorial matrix, the team editor and the AE menu editor.

### 2.3 Permissions

Host permissions are limited to `https://*.manuscriptcentral.com/*`; the
notes server is reached by its function URL, set by the user. The extension
contains no remote code, and the build checks that (see 2.1). The restyling
rules are in the package; none are fetched.

## 3. Backend

### 3.1 Stack

- **Language:** Rust for all Lambda functions, chosen for fast cold starts and
  low memory. Functions are built with `cargo-lambda` and the `lambda_runtime`
  crate. They run on arm64 (Graviton) at 128 MB unless measurement shows they
  need more.
- **HTTP front end:** Lambda function URLs, not API Gateway. Function URLs are
  free, while API Gateway's free tier lasts only 12 months. Each request
  carries a Cognito JWT that the Lambda verifies itself. The JWKS is fetched
  once per container and cached.
- **Functions:** two to start. `api` serves the JSON API for the extension and
  `dashboard` serves HTML pages. They share one Rust crate for the data layer.
- **Database:** one DynamoDB table in on-demand capacity mode (section 5).
- **Auth:** one Cognito user pool. The extension uses the authorization-code
  flow with PKCE through `chrome.identity.launchWebAuthFlow`. The dashboard
  uses the Cognito hosted login page and a secure, HTTP-only session cookie.
- **Infrastructure as code:** AWS SAM or CDK, to be chosen when backend work
  starts.

### 3.2 Chat updates without a WebSocket

API Gateway WebSockets stop being free after 12 months, so the chat polls.
These rules keep polls cheap:

- Each thread has a small "head" item with a version counter. The counter goes
  up on every new message, edit, or visibility change. A poll is one `GetItem`
  on that head, which costs 0.5 read capacity units with an eventually
  consistent read. Messages are fetched only when the version has changed.
- The client polls only while the chat is visible. It polls every 15 s while
  the user is active and every 60 s when the window is unfocused. It stops
  when the computer is idle or the panel is closed. Posting a message triggers
  an immediate refresh.
- One poll request covers all the threads a user has open, so several tabs
  still cost one request.

### 3.3 Dashboard

- Rust, with **minijinja** templates (Jinja2-compatible syntax) compiled into
  the Lambda binary.
- Access requires a Cognito login. Who can see which journals follows the same
  roles as chat, which by default means the EiC, editors, and staff.
- Pages are small, server-rendered HTML with one stylesheet and no front-end
  framework. Sorting and filtering use query parameters, and a small script
  may add click-to-sort on top.

## 4. Free-tier budget and efficiency

The backend must stay inside the AWS **always-free** allowances, not the
12-month introductory ones:

| Service | Always-free allowance (per month) | How we stay inside it |
|---------|-----------------------------------|------------------------|
| Lambda | 1,000,000 requests and 400,000 GB-seconds | Rust on arm64 at 128 MB, polling only while the chat is visible, and batched writes. |
| DynamoDB | 25 GB storage. Read and write capacity is free only in provisioned mode, which we don't use. | One table in **on-demand** mode, so requests are billed at cents per month (see below). Items stay small, and index writes are counted. |
| Cognito | 10,000 monthly active users on the Lite/Essentials tier (check current pricing at build time) | We need far fewer. |
| Lambda function URLs | No extra charge | Used instead of API Gateway. |
| CloudWatch Logs | 5 GB ingestion | Log errors and summaries, not every request. |

AWS changes these terms. Verify them before launch and record the date you
checked.

**DynamoDB on-demand cost.** On-demand capacity isn't part of the always-free
tier, so DynamoDB requests are the one small bill. With the request budget
below, a month uses roughly 0.5 million read request units (polls are
eventually consistent and cost half a unit each) and under 0.3 million write
request units. At us-east-1 list prices when this was written (about $0.125
per million reads and $0.625 per million writes), that's under $0.50 a month.
Check current prices before launch. On-demand also means no throttling when
a busy hour exceeds a fixed allocation.

The rough request budget below assumes 30 active users who each work 6 hours a
day on 22 days a month, with the chat visible for half that time:

- chat polls, at about 4 a minute while the chat is visible:
  30 × 3 h × 60 × 4 × 22 ≈ 475,000 requests;
- activity uploads every 5 minutes: 30 × 6 × 12 × 22 ≈ 48,000;
- messages, page loads, and dashboard views: well under 50,000.

That comes to roughly 575,000 Lambda requests a month, inside the 1,000,000
allowance with room to grow. Above about 50 heavy users, we would lengthen the
poll intervals or add a cheap "anything new?" check served from a cache.

Activity tracking uploads one batch every 5 minutes, and also when the browser
goes idle (Goals 7.3).

Efficiency rules for all code:

- Use one table, designed around its access patterns (section 5), and no scans
  in request paths.
- Use eventually consistent reads unless correctness needs a strongly
  consistent read.
- Batch reads (`BatchGetItem`) and writes (`BatchWriteItem`) where possible.
- Keep items under 1 KB where possible, so each write costs one write request
  unit.
- Document the expected read and write cost of every endpoint.

## 5. DynamoDB schema (proposed)

### 5.1 Table settings

| Setting | Value |
|---------|-------|
| Table name | `electric-mc` (one per stage, e.g. `electric-mc-prod`) |
| Keys | `PK` (string, partition), `SK` (string, sort) |
| Capacity | On-demand (`PAY_PER_REQUEST`) for the table and all indexes. No pre-allocated RCU or WCU. |
| TTL attribute | `expiresAt` (epoch seconds) |
| Encryption | AWS-owned key (default, free) |
| Point-in-time recovery | Off at first (costs extra); weekly backup instead |

Notation: `<site>` is the Manuscript Central site path (e.g. `ieee-tmi`),
`<baseId>` is the manuscript ID without its revision suffix (e.g.
`TMI-2026-0123`), `<sub>` is the person's Cognito subject, `<ulid>` is a
time-sortable unique ID, and `<ts>` is an ISO-8601 UTC timestamp.

### 5.2 Item types

| Item | PK | SK | Main attributes |
|------|----|----|-----------------|
| Person | `PERSON#<sub>` | `PROFILE` | `name`, `email`, `mcEmails` (list), `trackingOptIn` (bool) |
| Journal role | `PERSON#<sub>` | `JOURNAL#<site>` | `roles` (set: `AE`, `EDITOR`, `EIC`, `STAFF`, `ADMIN`) |
| Journal config | `JOURNAL#<site>` | `CONFIG` | `name`, `blindReview` (`single` / `double`), `attentionDays`, `attentionMinutes`, `selectorsVersion` |
| Manuscript | `MS#<site>#<baseId>` | `META` | `title`, `status`, `currentRevision`, `submittedAt`, `statusChangedAt`, `lastViewedAt`, `lastViewedBy`, `lastWorkedAt`, `activeSeconds`, `lastMessageAt`, `linkedIds` (resubmission lineage); also `GSI1PK`, `GSI1SK` |
| Thread head | `MS#<site>#<baseId>` | `HEAD` | `version` (number, incremented on every message, edit or visibility change) |
| Manuscript role | `MS#<site>#<baseId>` | `ROLE#<role>#<sub>` | `role` (`REVIEWER`, `HANDLING_AE`, `EDITOR`, `ASSIGNING_EDITOR`), `reviewerNumber` (for reviewers), `assignedAt`, `active` (bool, false after a final decision or when the person is removed), `endedAt` (when `active` became false; limits which messages the person can still read, section 5.5), `title`, `status` (copied from `META`), this person's `lastWorkedAt` and `activeSeconds` on this manuscript; while active, also `GSI3PK`, `GSI3SK` |
| Message | `MS#<site>#<baseId>` | `MSG#<ulid>` | `author` (sub), `body`, `visibility` (set: `REVIEWERS`, `HANDLING_AE`, `ALL_AES`, `EDITOR`, `ASSIGNING_EDITOR`, `EIC`), `revision`, `createdAt`, `editedAt`, `deleted` (bool) |
| Message history | `MS#<site>#<baseId>` | `HIST#<msgUlid>#<ts>` | `actor`, `change` (`EDIT` / `VISIBILITY` / `DELETE`), `before`, `after` |
| Activity session | `MS#<site>#<baseId>` | `ACT#<ts>#<sub>` | `start`, `end`, `activeSeconds`, `pageType`, `expiresAt`; also `GSI2PK`, `GSI2SK` |

Notes:

- Role assignments are written by the admin loader from the static
  configuration (Goals section 3) and by email ingestion. The extension
  never writes them (section 5.5).
- "All AEs" and "EiC" are journal-level roles, read from the person's journal
  role items. The other audiences come from the manuscript's role items.
- Message bodies are capped at 2 KB, so a message costs at most 2 write
  request units.
- `HEAD` is kept separate from `META`, so the frequent version bumps don't
  rewrite `META` and its `GSI1` copy.

### 5.3 Indexes

| Index | Partition key | Sort key | Projection | Used for |
|-------|---------------|----------|------------|----------|
| `GSI1` | `GSI1PK` = `JOURNAL#<site>` | `GSI1SK` = `<lastAttentionTs>#<baseId>` | INCLUDE: `title`, `status`, `submittedAt`, `lastViewedAt`, `lastViewedBy`, `lastWorkedAt`, `activeSeconds`, `lastMessageAt` | Dashboard attention list for a journal, least-recently-touched first. Only `META` items carry these keys. |
| `GSI2` | `GSI2PK` = `PERSON#<sub>` | `GSI2SK` = `<ts>#<site>#<baseId>` | KEYS_ONLY plus `activeSeconds` | A person's own activity history, newest first. Only activity sessions carry these keys. |
| `GSI3` | `GSI3PK` = `ASSIGN#<site>#<role>` | `GSI3SK` = `<sub>#<baseId>` | INCLUDE: `title`, `status`, `assignedAt`, `lastWorkedAt`, `activeSeconds` | Current workload. One query on `ASSIGN#<site>#HANDLING_AE` lists every AE's current manuscripts, grouped by AE; adding `GSI3SK` begins with `<sub>#` narrows it to one AE. The same works for editors and reviewers. It's a sparse index: the loader removes `GSI3PK` and `GSI3SK` when a manuscript reaches a final decision or the assignment ends, so only current work is indexed. |

Other dashboard columns are sorted in the Lambda after the `GSI1` query,
because a journal has at most a few hundred open manuscripts.

### 5.4 Access patterns and cost

| Operation | DynamoDB calls | Approximate cost |
|-----------|----------------|------------------|
| Chat poll (per open thread) | `GetItem` on `HEAD`, eventually consistent | 0.5 read unit |
| Load a thread | `Query` on `PK = MS#…`, `SK` begins with `MSG#`, plus a `Query` for `ROLE#` items | 0.5 read unit per 4 KB read |
| Post a message | `TransactWriteItems`: put `MSG#`, increment `HEAD.version`, update `META.lastMessageAt` | about 2 write units per item (transactions cost double) |
| Change a message's visibility | Transaction: update `MSG#`, put `HIST#`, increment `HEAD` | about 6 write units |
| Upload activity (every 5 minutes) | `BatchWriteItem` of `ACT#` items, then `UpdateItem` on each touched `META` and on the person's `ROLE#` item for that manuscript | 1 write unit per item |
| Dashboard page | `Query` on `GSI1` for the journal | a few read units |
| My history | `Query` on `GSI2` for `PERSON#<sub>` | a few read units |
| Who viewed a manuscript, and when | `Query` on `PK = MS#…`, `SK` begins with `ACT#` | a few read units |
| What every AE is working on now | `Query` on `GSI3`, `GSI3PK = ASSIGN#<site>#HANDLING_AE` | a few read units per journal |
| What one AE is working on now | `Query` on `GSI3`, same key, `GSI3SK` begins with `<sub>#`; repeat per journal for an AE on several journals | under 1 read unit per journal |

Permission checks happen in the Lambda. It loads the caller's journal roles
and the manuscript's role items, and returns only messages whose
`visibility` set includes an audience the caller belongs to. Authors and
admins see everything (Goals 6.5).

Activity sessions expire after one year through `expiresAt`, and TTL deletion
is free.

### 5.5 Who can see a manuscript's notes

Proposed 2026-10-23. The server is the only gatekeeper. The extension never
decides what a person may see, and the backend never grants access because
the extension says so.

1. **Assignments come from ScholarOne's own email.** The co-chair mailbox is
   copied on every "now in your Associate Editor Center" email, and the
   ingestion Lambda turns it into a `HANDLING_AE` role item for the address
   it was sent to, deactivating the previous AE ([Email
   ingestion.md](Email%20ingestion.md), section 4). Roles the extension reads
   from MC pages are only observations. They can be shown to the co-chair as
   a suggestion to confirm, but they never create a role item.
2. **A login is bound to an MC person by email.** Cognito verifies the
   sign-in address with an emailed code. A person record (`PERSON#<sub>`)
   holds every address its owner has verified, and a person can add another
   address (for example the one MC uses) by verifying it the same way. Role
   items written for an address that maps to no verified account wait on an
   unverified person stub and attach to the account once someone verifies
   that address (`MAILBOX#<address>`, Email ingestion section 5).
3. **Every read is filtered in the Lambda** (section 5.4): it loads the
   caller's journal roles and their role items on the manuscript, and returns
   only messages whose `visibility` includes one of the caller's audiences.
   Visibility is retroactive, so a newly assigned AE sees the earlier
   `HANDLING_AE` notes.
4. **After an assignment ends** (a reassignment or a final decision), the role
   item gets `active = false` and `endedAt`. That person keeps read access to
   messages created up to `endedAt` and sees nothing posted later. They can't
   post or change visibility (Simson, 2026-10-23).
5. **The co-chair sees everything** and can grant or revoke a role item by
   hand from the dashboard, for example when an assignment email never
   arrived. Manual changes are logged like other history items.

Not chosen for now: end-to-end encryption with per-manuscript keys. It would
keep the server from reading notes, but giving a newly assigned AE the keys
to earlier notes makes retroactive visibility hard.

## 6. Extension page flow and data loading

Status: proposed, 2026-10-18. The page sequence below comes from journal
editor guides and the links in the sample notification emails, not from
captured page HTML. Before the selectors are written, the prototype's capture
mode (6.4) must confirm it.

### 6.1 The order Manuscript Central shows pages

1. **Login** at `https://mc.manuscriptcentral.com/<site>`, or a deep link
   `…/<site>?URL_MASK=<hex>` from an email, which goes to login first and then
   straight to that manuscript.
2. **Welcome or main menu**, with one entry per role the account holds:
   Author, Reviewer, Associate Editor Center, and the editor, chair or admin
   centers.
3. **Role center dashboard.** A list of queues with counts, for example
   "Select Reviewers", "Invite Reviewers", "Awaiting Reviewer Scores",
   "Awaiting AE Recommendation" and "Awaiting Decision".
4. **Queue list.** A table of the manuscripts in one queue, with ID, title,
   dates, status and a "Take Action" control.
5. **Manuscript page.** Details, authors, the reviewer list with statuses,
   companion papers, the recommendation or decision form, and history.
   Reviewer details, letters and the PDF proof open in **pop-up windows**.
6. The user goes back to the queue list or dashboard and repeats steps 4
   and 5.

Manuscript Central navigates with form posts and opaque, encrypted URL
parameters, so **the URL doesn't identify the page.** The content script
identifies each page from the DOM: page heading, breadcrumb, queue name, and
the manuscript ID shown on the page. The page fingerprints are per-journal
data, like the restyling selectors.

### 6.2 Queries, in page order

| When | Extension does | Backend calls | DynamoDB |
|------|----------------|---------------|----------|
| First Manuscript Central page in a browser session (normally login or the welcome page), or when the cache is more than 15 minutes old | **Preload:** one `GET /v1/bootstrap?site=<site>` | `api` Lambda | Editors who see the whole journal (co-chair, EiC, staff): one `Query` on `GSI1` for the journal's active manuscripts. AEs: one `Query` on `GSI3` for their own assignments. Both are followed by `BatchGetItem` on those manuscripts' `HEAD` items (100 per call) for thread versions. |
| Role center dashboard | Draws badges (notes, overdue, untouched) from the cache. Sends the queue counts it sees as observations. | None to read. One batched `POST /v1/observations`, only if something differs from the cache. | One `UpdateItem` per changed manuscript. |
| Queue list | Matches each row's manuscript ID against the cache and adds badges and a "last worked" column. Records each row's queue and status. | None to read. Observations batched as above. | Updates only for differences. |
| Manuscript page | Switches the chat panel to this manuscript. Loads messages only if the cached version is older than the cached `HEAD` version. Scrapes the AE, reviewers and dates for observations. Starts activity timing. | `GET /v1/threads/<id>?since=<version>`, only when needed | One `Query` on `MSG#` items. |
| While the chat is visible | Polls the versions of all open threads in one call | `POST /v1/poll` with up to ~20 thread IDs | `BatchGetItem` on `HEAD` items, 0.5 read unit each |
| Posting or changing a message | Optimistic update in the panel | `POST /v1/threads/<id>/messages` or `PATCH …` | Transaction (section 5.4) |
| Every 5 minutes, or when the browser goes idle | Uploads activity | `POST /v1/activity` | Batch write (section 5.4) |

The **bootstrap response** is one compact JSON document with one row per
active manuscript: ID, revision, title, status, the caller's roles on it, the
handling AE's name, deep link, thread version, message count, and the caller's
own last-worked time. A few hundred manuscripts come to well under 100 KB.

### 6.3 Extension memory

- The bootstrap result lives in `chrome.storage.session`. It survives
  service-worker restarts and is cleared when the browser closes, so
  confidential manuscript data never sits on disk. A journal-level change
  counter (`JOURNAL#<site>` / `VERSION`, incremented by every write) lets a
  refresh be one `GetItem` when nothing has changed.
- Message bodies for threads the user has opened are cached the same way,
  keyed by thread version.
- The last version each user has read is kept in `chrome.storage.local`, which
  drives the unread badges. Moving it to the backend, so it follows a person
  across devices, is a later option.
- Observations go into a small outbox queue and are sent in one batch at
  most every 30 seconds, so moving quickly through queue pages doesn't
  produce a burst of requests.

### 6.4 Prototype capture mode

The first extension prototype has a developer "capture mode". On every
Manuscript Central page it records the page fingerprint it computed, the
manuscript IDs it found, and (on request) the page's HTML, which it saves to a
local download. That HTML stays on the user's machine and is used to build
and test selectors. It must never be committed, because it contains
confidential manuscript data.

### 6.5 Test extension (built 2026-10-18)

The test build in [`extension/`](../../extension/README.md) implements the page
parsers, title rewriting, capture mode and a shareable debug log, with no
backend yet.

- **Parsers anchor on text, not markup.** Page type comes from weighted
  signals (a password field, links to several "… Center" pages, queue names
  with counts, a table whose rows hold manuscript IDs, manuscript labels such
  as "Manuscript ID:" and "Reviewer List"). Fields are found by their visible
  labels and column headers, never by class or ID. Each extractor has
  fallbacks and records which one worked.
- **Robustness tests.** Every synthetic fixture is re-parsed after simulated
  template changes: classes and IDs stripped or renamed, tables wrapped in
  divs, labels upper-cased, `<th>` turned into `<td><b>`, bold labels turned
  into spans, label rows turned into `<dl>`, columns reversed, non-breaking
  spaces and extra whitespace, curly quotes and missing colons, and banner
  and sidebar noise. The parse must not change. The same mutations run
  against real captures with `npm run validate -- --mutate`.
- **Fingerprint.** A hash of the page's tag structure (no text) is logged on
  every parse. When ScholarOne changes a template, the fingerprint changes,
  and the log shows which pages changed and whether parsing still worked.
- **Log sharing.** The log is a ring buffer of 2,000 entries in
  `chrome.storage.local`. The side panel exports it to
  `Downloads/electric-mc/logs/` in two forms. The redacted export keeps page
  types, signals, strategies, warnings, fingerprints, counts and field
  labels, and replaces manuscript IDs with hashes. It drops names, titles,
  email addresses and query strings, so users can send it to us. The full
  export is for the user's own debugging.
- **Local files.** An extension can't write to an arbitrary path. It can save
  into the Downloads folder (or wherever the user picks in a Save dialog)
  through `chrome.downloads`, which the test build uses. A later build could
  use the File System Access API from the side panel to write into a folder
  the user picks once, but Chrome asks for permission again each session.
  The backend upload of redacted logs comes with M0.
