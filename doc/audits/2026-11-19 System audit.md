# Electric MC system audit, 2026-11-19

Scope: `main` at 9adc809 plus the open PR #82 branch (`claude/decided-rows-red`, extension 0.0.78: decided-paper highlighting, flag labels, one-button reject). Extension (TypeScript/WXT), `backend/notes` (Rust Lambda), `tools/mc-watch` (Python), `doc/` and `doc/planning/`.

Evidence used: a read of every extension module, a full test run in the cloud (37 files, 399 tests, all pass), and aggregate counts from the developer log on Simson's Mac (`var/electric-mc.log`, 6,985 entries). Only counts, MC's own field and function names and page names were read from the log; no IDs, titles or names. No code was changed.

## 0. Short answer: is it getting brittle?

Not yet in the parsers; yes in the wiring.

- The **parsers** (`parsers/`, most of `lib/`) are in good shape: text-anchored, tested (lib 83%, parsers 90% line coverage) and they fail soft (warnings, "unknown").
- The **orchestration** is where brittleness is growing. `entrypoints/content.ts` (761 lines) runs about 30 features on every page load and every DOM mutation, wires 7 separate capture-phase click listeners whose correctness depends on registration order, and holds feature state in closures. It has 0% test coverage, as do `background.ts` (329 lines) and the side panel (824 lines). Features talk to each other through sessionStorage key strings that other modules hard-code. That is the part that will break first as features are added.
- The **riskiest feature** is one-button reject: it chains 8 page transitions, depends on about 12 separate MC anchors, makes a real assignment, and presses Submit on the co-chair recommendation itself. Two concrete gaps are in section 4.

## 1. How MC works: server-rendered, with a little AJAX

Answer to "Is EVERYTHING pre-rendered on their servers?": almost everything. From 724 page loads in the developer log:

- **Every page is one big server-rendered form.** All 657 pages that had MC's form carried the same ~40 hidden fields: `XIK_TAGACT`, `PAGE_TOKEN`, `CURRENT_PAGE`, `NEXT_PAGE`, `NEXT_PAGE_FOR_REDIRECT`, `DOCUMENT_HASHCODE`, `XIK_CUR_ROLE_ID`, `XIK_CUR_USER_ID`, `XIK_DOCU_ID`, `CURRENT_QUEUE_TYPE`/`VALUE`, `ORIGINAL_JSESSIONID`, `NATURAL_TIMEOUT`, and so on.
- **No JSON data islands.** 0 of 724 pages had a `<script type=…json>` block.
- **Clicks are "set a field, submit the form".** The JavaScript behind logged clicks: `setField` (431), `popWindow` (67), `window.open` (63), `setDataAndNextPage` (31), `setDataAndNextPageOneDataValue` (27), `quickSearch` (19), `toggleBranch` (6). Each one fills hidden fields and posts the whole form, and the server answers with a whole new HTML page.
- **AJAX exists but is small.** The "+ Search" toggle calls `scholaroneAJAXServlet` (2 requests per press, 200 OK, about 301 bytes each; 339 keepalives confirm it). Reports open in a separate IBM Cognos app (`cognos.cgi`), which is JavaScript-heavy and a different system.
- **Caveat:** the developer trace doesn't record XHR/fetch, so other small AJAX calls (session-timeout dialog, reviewer lookup, autocomplete) can't be ruled out yet.

How to find out for sure, cheapest first:

1. In developer mode, add a `PerformanceObserver` for `resource` entries in the content script. It logs every XHR/fetch URL path, status and size, with no bodies. No new permission.
2. Test builds only: a MAIN-world wrapper around `fetch`/`XMLHttpRequest` that logs request *parameter names* and response content type. It's bundled code, so it's allowed in the store, but it's invasive, so keep it out of the store build.
3. One-off: DevTools → Network → Fetch/XHR during a normal session, saved as a HAR into `var/` (it holds real data), and summarized by a script that prints paths only.

What that means for "call MC's APIs from the extension, as their JavaScript does":

- **The "API" is the form-post protocol, not JSON.** A request is a POST to `/<journal>` with the hidden fields and an action token, and the answer is HTML. The parsers already take a `Document`, so `DOMParser` on a fetched response plugs straight in.
- **The danger is session state, not authentication.** `PAGE_TOKEN`, `CURRENT_PAGE` and `DOCUMENT_HASHCODE` show that MC keeps a per-session page state machine. A background request that advances it can make the visible tab's next submit out of sequence. That fits the 0.0.26–0.0.33 hidden-frame lookup that logged Simson out. PDF re-fetches (`lib/pdfcount.ts`) haven't caused trouble, so plain file GETs look stateless.
- **Proposed experiment (test build, developer mode, one tab):** from the content script (same origin, cookies included, no new permission), replay one read-only POST, such as opening a manuscript's details from a grid link's action. Then check whether the visible tab still works, and whether `PAGE_TOKEN` changed. Do the same for a `scholaroneAJAXServlet` call. Record the outcome per action type in a table. Only allow-listed, proven-safe calls should ever run unattended. A service-worker fetch is also possible but needs testing for whether Chrome sends MC's session cookie from the extension origin.
- **Free win today:** `CURRENT_PAGE` names the page exactly (`ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS`, `ASSOCIATE_EDITOR_VIEW_MANUSCRIPTS`, `…_DASHBOARD`, `HOME`, `LOGIN`, `REVIEWER_VIEW_MANUSCRIPT_DETAILS_POPUP_RECOMM`, …). The heuristic classifier should use it as its strongest signal. In the log, the dashboard was classified "unknown" in about half of its visits (the log pairs page and parse events only approximately, so treat this as rough). Co-chair pages also use `ASSOCIATE_EDITOR_*` names in CACM's setup.

## 2. Documentation correctness

Wrong (fix first):

- **`doc/FEATURES.md`, Privacy section:** "GPG-encrypted per-manuscript notes that can only be read by specific individual". This is false. Notes are *signed* (ECDSA P-256, `lib/notesClient.ts`) and sent to the notes server as plain text. End-to-end encryption is design-only. The sentence is also cut off.
- **Redacted log export leaks manuscript IDs.** The Privacy Policy and README say the redacted export drops IDs. But `redactEntry` (`lib/log.ts`) only removes email addresses from string data, and three events log a bare ID as a string: "no version links found", "take action after search", and "search did not find exactly that manuscript" (`entrypoints/content.ts`). This is a code bug as well as a doc mismatch.
- **Privacy Policy is missing 0.0.78 items:**
  - Flag labels kept per journal (`KEY.flags`).
  - One-button reject keeps the text of your comments to the author and editor in that tab's sessionStorage for up to 30 minutes, then copies it into the co-chair form.
  - The keepalive's automatic requests to MC (off by default).
- **Privacy Policy, identity:** it should say that the identity comes from MC's analytics (Pendo) metadata, and that it's stored per site in local storage even without a notes server (`rememberIdentity` always runs).
- **`doc/planning/Technical Stack and Architecture.md` §2, still says, contrary to the code:**
  - "UI … rendered inside a Shadow DOM". Only the debug badge is; everything else is inline elements with `!important` styles.
  - `chrome.idle` activity sensing. Not used, and there's no `idle` permission; the keepalive uses DOM events.
  - An options page. Settings live in the side panel.
  - Playwright end-to-end tests against saved pages. Only `tools/e2e/load-check.mjs` exists, which loads the build.
  - `ts-rs`/OpenAPI types. None.
  - Restyling rules fetched from the backend. None.
  - A service worker holding a Cognito session. Cognito was dropped; the header note says so, but §2.2 wasn't updated.

Stale (small):

- `extension/README.md` says "now 0.0.73" (it's 0.0.78).
- `package.json` description says "test extension: page parsers, debug overlay, and logging".
- `background.ts` header: the backend "preload" isn't built, and the icon "(blue on, grey off)" is brown.
- `content.ts` `askBackend()` is a stub that always returns null.
- "0.2.6" in `lib/messages.ts` and in the Privacy Policy change log looks like an old version number.

Missing from FEATURES.md:

- the keepalive (off by default);
- auto Take Action on a single search result;
- clicking anywhere in a choice row picks it;
- larger nav and pager arrows;
- the emphasized Version History box;
- auto Log In (it is mentioned, but only in passing).

Correct as far as checked: CHANGELOG entries for 0.0.73–0.0.78 match the code, as do the FEATURES entries for guards, auto-advance, the To EIC list, flags, the AE menu and PDF zoom/word count.

Process gap: the Rust backend has tests (`backend/notes/tests/api.rs`) but CI never runs `cargo test`.

## 3. Dependencies on MC page structure, ranked

The **harm** column is what goes wrong when the anchor silently breaks or matches the wrong thing.

| # | Feature (module) | MC anchors it depends on | Harm if wrong | Fragility |
|---|---|---|---|---|
| 1 | One-button reject (`lib/onebutton.ts`) | AE `<select>` with counted options and editor wording; Assign control by text, alt or src; editor block "AE:/CC:" lines; "Associate Editor Center"/"Co-Chair Center" link text; search bar; single-result Take Action; task-link names; "…Recommends" heading; Reject radio row; Submit label exactly "submit"; textarea names ending `COMMENTS_TO_AUTHOR`/`COMMENTS_TO_EDITOR`; reviewers-needed field regex; Pendo first/last name | **High**: real assignment, auto-Submit of a co-chair Reject | High (about 12 anchors, 8 transitions) |
| 2 | Auto-advance and carry task (`lib/advance.ts`) | nav arrow images `next_mss`/`prev_mss` or alt "Next Document"; "k / N" counter; Take Action grid; task-link name pattern; Recommends/Decision headings | Medium: opens the wrong paper or task (navigation only) | Medium |
| 3 | Guards: no choice, no author comment (`needchoice.ts`, `authorcomment.ts`) | Submit/Commit Decision labels plus heading; radios; author box found by *label text* | Medium: they fail **open**, so protection silently disappears | Medium |
| 4 | Decision and To EIC marking (`recommend.ts`, the submit recorder in `content.ts`) | Recommendations box heading; "Last, First" links; "rescind"; Status cell "Make Decision (Due" next to "Assign AE"; Audit Trail "Date"/"Event" columns and "Decision on Manuscript ID … successfully sent" | Low–medium: wrong red marking | Medium |
| 5 | Identity (`lib/identity.ts`) | inline `initializePendoMetadata({visitor:{…}})`, Clarivate's analytics vendor | Medium: notes authorship, one-button own-AE lookup, landing | **High likelihood**: a third-party script MC could drop at any time |
| 6 | Open by ID / auto Take Action (`search.ts`) | Search button text; nearest text box; "Manuscript ID" option or Bootstrap dropdown; "Take Action" column | Low | Medium |
| 7 | Earlier-version AEs and milestones (`milestones.ts`, `versions.ts`, `earlierae.ts`) | "Peer Review Milestones" text; "Date Submitted" row; Version History text; label keys | Low (display) | Medium |
| 8 | Classification and titles (`parsers/`) | breadcrumb "Details for"; "Take Action" header; labels; center link names | Low (soft fail) | Low–medium |
| 9 | Flags (`flags.ts`) | "Flag This Manuscript" text; icon file names | Low | Low |
| 10 | Keepalive (`keepalive.ts`) | "+ Search" toggle; `scholaroneAJAXServlet` in resource timing | Low | Low |
| 11 | Restyle, page header, pager (`restyle.ts`) | layout geometry; `/page_headers/` images; `td[width%]`; "Manuscripts a-b of n"; `left_arrow.gif` | Cosmetic | Medium |
| 12 | Login and landing (`login.ts`, `landing.ts`) | password input; "Create an Account" links; center link text | Low | Low |

Inconsistencies that raise fragility:

- The author-comment box is found **by name** in one-button reject and **by label text** in the comment guard. A rename breaks one silently.
- "The chosen radio's label" is read three different ways: `recommend.pickedChoice`, `authorcomment.chosenLabel` and `onebutton.rejectRadio`.

### Self-check that warns when MC changes

The current structural fingerprint can't do this. In the log there were 1,025 distinct fingerprints across 1,220 manuscript-page parses, because it hashes tags that vary with the data. Proposal:

- **Probes.** Each MC adapter (section 5, layer 1) exports named probes, such as `aeSelect`, `assignButton`, `recommendsForm.submit`, `authorBox`, `taskLinks`, `navBar`, `editorBlock`, `pendoIdentity`. A probe returns found or not found, with no page text.
- **Expected probes per page.** Keyed by `CURRENT_PAGE`. For example, `ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS` expects `editorBlock` and `taskLinks`, plus `versionHistory` when R≥1.
- **Learned baselines.** Locally, per page name, count how often each probe has passed. When a probe that has passed at least 20 times starts failing:
  - show a brown notice in the side panel ("MC changed: the Assign button wasn't found on the Assign AE page");
  - log it, redacted by construction;
  - **switch off the automations that depend on that probe**, starting with one-button reject and auto-advance;
  - say in the notice which feature is off.
- **Run before acting.** High-risk automations run their own probes before each step and refuse to start when any fail.
- **Check fixtures in CI.** Run the same probes against the synthetic fixtures, so a parser change that breaks a probe fails the build.
- **Optional: shared signature.** A redacted "page signature" per `CURRENT_PAGE` (MC's own label keys and control names, never values) that users could share. It's safe because labels are MC's text, not manuscript data.

## 4. Concrete defects found while reading

1. **Redacted export leaks IDs** (section 2). Fix: run string data through the ID regex too, and give `send()` a typed event shape so data is always an object.
2. **One-button: the AE step is marked done at the press, not when MC accepts it.** `noteAeSubmit` moves to `ae-sent` inside the click handler. If MC refuses the AE recommendation (a validation error re-renders the form), the run still goes on to the Co-Chair Center and can reach the co-chair Reject. The submit recorder in `content.ts` does this correctly ("noted at the press and kept once MC answers with a new page"); one-button should do the same. In the next state, confirm the paper's Recommendations box or the task list now shows the AE's recommendation.
3. **One-button: `cc-details` auto-submits any "…Recommends" form.** `recommendSubmit` only checks that a heading ends in "recommends". It should require the co-chair heading (and refuse "AE Recommends") before the timed Submit, and confirm `CURRENT_PAGE` too.
4. **One-button knows auto-advance's private keys.** `noteAeSubmit` clears `emc-advance` and `emc-carry-task` by name, twice, with a `setTimeout(0)` to win a listener race. Rename either key and the run auto-advances to the next paper mid-run.
5. **Notes write race.** The side panel's `updateNotes` reads, modifies and writes `KEY.notes` directly, while the background's prune and migration write the same key through their own queue. Concurrent writes can drop a note. All model writes should go through the background (or one shared lock).
6. **Clear all data is incomplete.** It leaves the IndexedDB signing keys (`electric-mc`/`keys`), `lastActivity`, `lastKeepalive`, `lastPrune` and `matrixHideColumnists`. Its confirm text doesn't mention identity or flags.
7. **Repeated work per run.** `decisionLettersIn` runs up to three times per `run()`, `labeledValues` is recomputed by several features, and `scaleFonts` walks every element. With the 500 ms mutation debounce this is fine today, but it grows linearly with features.

## 5. Proposed layering

```
ui/         injected marks, banners, toasts, styles (EMC_COLOR lives here), side panel, matrix, team, AE-menu windows
features/   one module per feature: { id, setting, pages, needs: probes, onPage(ctx), onPress(ctx, phase) }
automation/ step-machine runner for multi-page flows (one-button, advance, carry task, open-by-ID)
record/     observation & trace recorder: dev trace, resource observer, probe results, redaction, sinks (ring log, live log)
store/      single owner of chrome.storage (background): schema version, migrations, serialized updates, change feed
model/      pure TS: types + reducers  apply(model, observation) -> model, pruning, merge rules
mc/         ALL knowledge of MC: page adapters (DOM -> typed facts + element handles + probes), later mc/client (form-post protocol)
core/       text, ids, dates, names (fold), hashing: shared by extension, dashboard page, tools
```

The rules: `mc/` never writes storage or UI. `model/` never touches the DOM or `chrome.*`. `features/` never reads storage directly: they get a context with the page facts and a model snapshot, and they emit observations and UI intents. Only `store/` calls `chrome.storage`.

What moves where, from today's code:

- **`mc/`** gets:
  - `parsers/` as is;
  - the MC-reading halves of `aeload`, `recommend`, `milestones`, `flags`, `identity`, `advance` (`findNavBar`, `taskLinks`, `currentTask`), `search`, `idlink`, `onebutton` (`findAssignButton`, `rejectRadio`, `commentBoxes`, `recommendSubmit`, `centerLink`, `reviewersField`), `keepalive.findSearchToggle`, `landing` and `restyle.findColumn`;
  - new: `mc/page.ts` reads `CURRENT_PAGE` and the hidden fields;
  - new: `mc/grid.ts` replaces three copies of the Take Action grid walk (`idlink.linkIds`, `idlink.gridActions`, `search.singleResultAction`) and two copies of "a table with header X" (`recommend.annotateEicRows`, `milestones.decisionLettersIn`);
  - new: `mc/recommendForm.ts`, one reader for radios, the chosen label, Submit/Commit, the comment boxes (by name *and* label) and the heading role.
- **`model/`** gets the merge logic that now sits inline in `background.ts` (`remember`, `rememberVersion`, `updateEic`, `rememberFlags`, `rememberAeLoad`, `rememberRoles`, `rememberIdentity`), plus `seen.ts`, `notes.ts`, `team.ts` and `roles.addRoles`. All of these become pure functions with tests. Today they are untested because they live in the 0%-covered background.
- **`store/`** is the `KEY` table plus one `update(key, fn)` under the existing `makeQueue`, schema versions, and the migrations now scattered through `getSettings`, `rememberIdentity` and `team`.
- **`record/`** gets `devtrace`, `log`, `livelog` and the redaction rules. Keep "data kept for features" (model) apart from "data kept for learning MC" (traces). They have different retention and redaction rules, and today both go through the same `log` event stream.
- **`features/` plus a dispatcher** turns `content.ts` into about 100 lines: parse once into a memoized `PageContext`, then call each enabled feature's `onPage`.
  - One capture click listener with explicit phases replaces the seven listeners whose order now lives in comments: `guard` (no choice, no comment; can cancel), then `record` (submitted choice, one-button AE submit, PDF opened, dev trace), then `act` (advance, radio rows).
  - A typed `tabState` module replaces the five hand-rolled sessionStorage helpers (advance, onebutton, landing, search, submit recorder), with TTLs and namespaced keys, so no module knows another's keys.
- **`automation/`** gives one-button reject and advance a common runner:
  - each step declares the `CURRENT_PAGE` and probes it expects;
  - a step is confirmed on the *next* page, not at the press;
  - retries, timeout, the Stop banner and an audit log come built in.

  Both features hand-roll all of this today.
- **`core/`** gets `text`, `ids`, the MC date regex (duplicated in `extract.ts` and `milestones.ts`) and one `fold()` (now three: `onebutton`, `identity`, `roster`).

Order to do it (each step is shippable on the single open PR):

1. `mc/grid.ts`, `mc/recommendForm.ts`, `tabState` and the `CURRENT_PAGE` reader. These are pure refactors with existing tests, and they fix defects 3 and 4.
2. A click dispatcher with phases. Fixes defect 2 by moving confirmation to the next page.
3. `model/` reducers out of the background, plus `store.update`. Fixes defect 5 and makes the data model testable.
4. Probes and the self-check (section 3).
5. Split `content.ts` into feature modules behind a registry; settings defaults and the settings UI come from the registry.

## 6. Planned directions and what they need

- **Google Sheets.**
  - *From the browser:* `chrome.identity` OAuth needs the **`identity` permission** plus an `oauth2` client in the manifest, and a host permission for `https://sheets.googleapis.com/*`. These are new install-time permissions and must be flagged. The Sheets REST API is data, not code, so it's fine under MV3.
  - *From the Lambda:* a service account, and no extension permission. But manuscript data then has to reach the backend first, which is a Privacy Policy decision (§10), and Google becomes a processor of whatever goes in the sheet.
  - Either way, a `model/` → sheet-rows mapper in `core/` keeps one definition of the columns.
- **A dashboard on its own, separately authenticated page.** It needs the data model as a versioned schema that the extension, the page and the Rust Lambdas share. That argues for JSON Schema, with TS and Rust types generated from it (the `ts-rs` plan, which was never built).
  - If the page is hosted, the extension must upload model data, which is a privacy decision, and the page needs its own login: the passkey or signature design from the encryption work, not Cognito.
  - An extension page (`chrome-extension://…/dashboard.html`, like the matrix window) needs no auth and keeps data local. It's a cheaper first version, and the same components can move to a hosted page later.
- **Calling MC like its own JavaScript does.** See section 1. Build `mc/client.ts` on top of the adapters:
  - `post(action, fields) → Document`, only for actions proven safe by the experiment;
  - same-origin from the content script, so no new permission;
  - never during an automation run, and never when the visible tab has unsent form state (`PAGE_DIRTY_FL`).
  - `tools/mc-watch` (Python, separate Playwright browser) then becomes a candidate to fold into the extension. It also carries a third copy of MC page knowledge.

## 7. Suggested next steps

The privacy fixes need no refactor and should go first:

1. Fix the redacted export, the FEATURES "GPG-encrypted" line and the Privacy Policy gaps (flags, one-button comments in sessionStorage, the Pendo-sourced identity, the keepalive).
2. Before one-button reject leaves "testing": confirm the AE step on the next page and require the co-chair heading before the automatic Submit.
3. Add the `PerformanceObserver` resource log in developer mode, to settle the AJAX question with data.
4. Then the layering steps 1–5 above, on the single open PR. Simson merges.

## 8. Static checking (addendum, same day)

What runs today:

| Check | Where | Notes |
|---|---|---|
| `tsc --noEmit` | CI (`npm run typecheck`) | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` (some come from WXT's generated `.wxt/tsconfig.json`). Covers `lib/`, `parsers/`, `entrypoints/`, `components/`, `tests/`, `scripts/`, `tools/`. Clean. |
| Vitest with coverage | CI | 399 tests. Coverage is reported but no threshold is enforced. |
| `check-no-remote-code.mjs` | after every build and zip, and in CI | Chrome Web Store MV3 rule; it has tests of its own. |
| Load check (`tools/e2e/load-check.mjs`) | CI | Loads the build in headless Chromium, reloads it twice, and fails on extension errors. |
| `cargo test` | `make test` in `backend/notes`, by hand only | **Not in CI.** |
| `pytest` for `tools/mc-watch` | root `make`, by hand only | **Not in CI.** |

Tried on 2026-11-19 and not yet in CI:

- **typescript-eslint, `recommendedTypeChecked`:** 47 findings.
  - Most are noise: 18 unnecessary type assertions, and 10 "unused variables" that are deliberate `_x` names.
  - Worth fixing: 3 `no-misused-promises` (async `onClick` handlers in the side panel, so a rejection goes unhandled) and 2 `no-base-to-string` (an error message in `notesClient.ts` can come out as `[object Object]`).
  - No floating promises: the `bg()`/`void` convention holds.
- **Stricter tsc flags:**
  - `noUnusedLocals`, `noUnusedParameters` and `noImplicitReturns` all have 0 findings, so they can be switched on for free.
  - `exactOptionalPropertyTypes` gives 62 and `noPropertyAccessFromIndexSignature` gives 139. Both are optional.
- **`cargo clippy --all-targets`:** clean. **`cargo fmt --check`:** 56 hunks differ.
- **`ruff` on `tools/mc-watch`:** 24 findings with a broad rule set, mostly style. A few real ones: 5 files opened without `with`, 3 bare `except`, and 3 `subprocess.run` calls without `check`.

Available and unused:

- **Project-specific checks, the most valuable kind here:**
  - a **"no real MC data" scan** in CI and as a pre-commit hook: manuscript-ID shapes outside the 1000–1999/9000–9999 synthetic ranges, non-`example.org` email addresses in fixtures, docs and tests, and `var/`-style captures;
  - a **manifest permissions guard** that fails when `permissions` or `host_permissions` change unless an allowlist file changes in the same commit (the "flag any new permission" rule);
  - a **probe check** against the fixtures (section 3).
- **Generic tools:**
  - ESLint, with a short rule list rather than the full preset;
  - `knip`, for unused exports and files;
  - Dependabot or `npm audit` in CI;
  - GitHub CodeQL, free on a public repository;
  - GitHub secret scanning and push protection;
  - a coverage threshold for `lib/` and `parsers/`;
  - `cargo clippy -D warnings`, `cargo fmt --check` and `cargo test` in CI;
  - `ruff` and `pytest` for `tools/` in CI.
