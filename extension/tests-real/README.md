# Tests on real MC data (local only)

`npm run test:real` (or `make test`, which runs it after the normal tests)
checks the extension against real Manuscript Central data kept in the
repository's `var/` directory on the developer's own computer. `var/` is
git-ignored, and nothing from it may ever be committed (AGENTS.md). In CI,
and on any computer without `var/`, every test here skips.

What they read, all from `var/`:

| Data | Where it comes from | Checks |
|---|---|---|
| `real-pages/<CURRENT_PAGE>.html` | the weekly page refresh in test builds (developer mode), or Capture page HTML in the side panel | parses without errors; the page type agrees with MC's own page name; manuscript and list pages yield an ID or rows; the redacted parse holds no ID, title or email |
| `electric-mc.log` | the live log (developer mode) | every entry's redacted export holds no manuscript ID and no email address |
| `team*.json`, `roster.json`, `ae-menu*.json` | files the editor saved | load with the extension's own readers |
| `*.pdf` | manuscripts downloaded from MC | the word count runs and finds words |

The rules for these tests:

- They print counts, MC's page names (such as `ASSOCIATE_EDITOR_DASHBOARD`) and
  file numbers only, never a manuscript ID, title, name or email. Every
  `expect` compares a count or a boolean, so a failure can't print the data.
- They stay fast (a few seconds), so they run on every local test run.
- `REAL_DATA_DIR` points them somewhere other than `../var`.
