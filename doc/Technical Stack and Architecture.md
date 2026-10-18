# Electric MC: Technical Stack and Architecture

Status: approved by Simson on 2026-10-16. That covers the extension stack, the
Rust backend, Lambda function URLs, polling chat, and provisioned-capacity
DynamoDB. The requirements this design serves are in
[Design Goals.md](Design%20Goals.md); section references such as "Goals 6.4"
point there.

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
 └──────────────────────────────────────────┘         ┌───────────▼──────────────┐
                                                      │ DynamoDB, single table,  │
 Browser ── HTTPS ──► Lambda function URL: dashboard ─►│ provisioned capacity     │
                       (Rust + minijinja templates)    └──────────────────────────┘
```

## 2. Browser extension

### 2.1 Stack

- **Language:** TypeScript.
- **Build:** WXT, a Vite-based extension framework. It builds Manifest V3 for
  Chrome, and Edge and Firefox builds come from the same code. Chrome is the
  only supported browser for now.
- **UI:** Preact for the chat UI and options page, which keeps the bundle small.
- **Restyling:** plain CSS injected into Manuscript Central pages. Any UI that
  Electric MC adds to those pages, such as badges and buttons, is rendered
  inside a Shadow DOM so the page's styles and ours can't interfere.
- **Chat placement:** `chrome.sidePanel` for the docked chat and a
  `chrome.windows` popup for the pop-out. Both serve the same page
  (Goals 6.4).
- **Activity sensing:** `chrome.idle` combined with window focus and mouse
  movement (Goals 7.2).
- **API types:** generated from the Rust backend, with `ts-rs` or an OpenAPI
  schema, so the extension and the Lambda agree on request shapes.
- **Tests:** Vitest for unit tests. Playwright, with the extension loaded,
  runs end-to-end tests against saved copies of Manuscript Central pages.

### 2.2 Components

- **Content script** on Manuscript Central pages. It finds the manuscript being
  viewed, applies restyling, and senses user activity.
- **Service worker.** It holds the Cognito session, talks to the backend,
  batches and retries writes, and tracks which tab and window have focus.
- **Chat UI.** One web page used in two places, the side panel and the
  pop-out window.
- **Options page.** Sign-in, restyling preferences, and the activity-tracking
  opt-in.

### 2.3 Permissions

Host permissions are limited to `https://*.manuscriptcentral.com/*` and the
backend's own URLs. The extension contains no remote code. Restyling rules
fetched from the backend are data (selectors and style properties) and are
validated before use.

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
- **Database:** one DynamoDB table in provisioned-capacity mode (section 5).
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
| DynamoDB | 25 GB storage, 25 provisioned RCU and 25 WCU | One table in **provisioned** mode, because on-demand isn't covered by the always-free tier. Items stay small, and GSIs count against the same budget. |
| Cognito | 10,000 monthly active users on the Lite/Essentials tier (check current pricing at build time) | We need far fewer. |
| Lambda function URLs | No extra charge | Used instead of API Gateway. |
| CloudWatch Logs | 5 GB ingestion | Log errors and summaries, not every request. |

AWS changes these terms. Verify them before launch and record the date you
checked.

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
- Keep items under 1 KB where possible, so each write costs one WCU.
- Document the expected read and write cost of every endpoint.

## 5. DynamoDB schema (proposed)

### 5.1 Table settings

| Setting | Value |
|---------|-------|
| Table name | `electric-mc` (one per stage, e.g. `electric-mc-prod`) |
| Keys | `PK` (string, partition), `SK` (string, sort) |
| Capacity | Provisioned: table 20 RCU / 20 WCU, `GSI1` 3 / 3, `GSI2` 2 / 2 (25 / 25 in total, the always-free limit) |
| TTL attribute | `expiresAt` (epoch seconds) |
| Encryption | AWS-owned key (default, free) |
| Point-in-time recovery | Off at first (costs extra); weekly on-demand backup instead |

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
| Manuscript role | `MS#<site>#<baseId>` | `ROLE#<role>#<sub>` | `role` (`REVIEWER`, `HANDLING_AE`, `EDITOR`, `ASSIGNING_EDITOR`), `reviewerNumber` (for reviewers), `assignedAt` |
| Message | `MS#<site>#<baseId>` | `MSG#<ulid>` | `author` (sub), `body`, `visibility` (set: `REVIEWERS`, `HANDLING_AE`, `ALL_AES`, `EDITOR`, `ASSIGNING_EDITOR`, `EIC`), `revision`, `createdAt`, `editedAt`, `deleted` (bool) |
| Message history | `MS#<site>#<baseId>` | `HIST#<msgUlid>#<ts>` | `actor`, `change` (`EDIT` / `VISIBILITY` / `DELETE`), `before`, `after` |
| Activity session | `MS#<site>#<baseId>` | `ACT#<ts>#<sub>` | `start`, `end`, `activeSeconds`, `pageType`, `expiresAt`; also `GSI2PK`, `GSI2SK` |

Notes:

- Role assignments are written by the admin loader from the static
  configuration (Goals section 3).
- "All AEs" and "EiC" are journal-level roles, read from the person's journal
  role items. The other audiences come from the manuscript's role items.
- Message bodies are capped at 2 KB, so a message costs at most 2 WCU to
  write.
- `HEAD` is kept separate from `META`, so the frequent version bumps don't
  rewrite `META` and its `GSI1` copy.

### 5.3 Indexes

| Index | Partition key | Sort key | Projection | Used for |
|-------|---------------|----------|------------|----------|
| `GSI1` | `GSI1PK` = `JOURNAL#<site>` | `GSI1SK` = `<lastAttentionTs>#<baseId>` | INCLUDE: `title`, `status`, `submittedAt`, `lastViewedAt`, `lastViewedBy`, `lastWorkedAt`, `activeSeconds`, `lastMessageAt` | Dashboard attention list for a journal, least-recently-touched first. Only `META` items carry these keys. |
| `GSI2` | `GSI2PK` = `PERSON#<sub>` | `GSI2SK` = `<ts>#<site>#<baseId>` | KEYS_ONLY plus `activeSeconds` | A person's own activity history, newest first. Only activity sessions carry these keys. |

Other dashboard columns are sorted in the Lambda after the `GSI1` query,
because a journal has at most a few hundred open manuscripts.

### 5.4 Access patterns and cost

| Operation | DynamoDB calls | Approximate cost |
|-----------|----------------|------------------|
| Chat poll (per open thread) | `GetItem` on `HEAD`, eventually consistent | 0.5 RCU |
| Load a thread | `Query` on `PK = MS#…`, `SK` begins with `MSG#`, plus a `Query` for `ROLE#` items | about 0.5 RCU per 4 KB read |
| Post a message | `TransactWriteItems`: put `MSG#`, increment `HEAD.version`, update `META.lastMessageAt` | about 2 WCU per item (transactions cost double) |
| Change a message's visibility | Transaction: update `MSG#`, put `HIST#`, increment `HEAD` | about 6 WCU |
| Upload activity (every 5 minutes) | `BatchWriteItem` of `ACT#` items, then `UpdateItem` on each touched `META` | 1 WCU per item |
| Dashboard page | `Query` on `GSI1` for the journal | a few RCU |
| My history | `Query` on `GSI2` for `PERSON#<sub>` | a few RCU |
| Who viewed a manuscript, and when | `Query` on `PK = MS#…`, `SK` begins with `ACT#` | a few RCU |

Permission checks happen in the Lambda. It loads the caller's journal roles
and the manuscript's role items, and returns only messages whose
`visibility` set includes an audience the caller belongs to. Authors and
admins see everything (Goals 6.5).

Activity sessions expire after one year through `expiresAt`, and TTL deletion
is free.
