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

## 5. DynamoDB single-table design (sketch)

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

A GSI keyed on `JOURNAL#<site>` and the "last attention" time lets the
dashboard build its attention list without a scan. Activity records expire
through a TTL attribute, and TTL deletion is free.
