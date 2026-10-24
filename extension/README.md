# Electric MC test extension

A Chrome extension for trying out the Manuscript Central page parsers. It
parses every `*.manuscriptcentral.com` page you open, rewrites the page title
so history and the Back menu make sense, highlights revisions, fills in what
earlier versions of a revision looked like, and logs problems. Nothing leaves your machine: there is no backend yet.

Design notes are in
[Technical Stack and Architecture.md](../doc/Technical%20Stack%20and%20Architecture.md#65-test-extension-built-2026-10-18).

## Version

Semantic versioning, set in `package.json` (now 0.0.33). The version shows
in the extension's name, the toolbar tooltip and the side panel header.
Bump it with every build you hand out. Every version bump gets an entry in
[CHANGELOG.md](CHANGELOG.md).

## Chrome Web Store package

`npm run zip:store` (the same as `STORE=1 npm run zip`) builds the package
for the Chrome Web Store, named "Electric MC" with the listing's description.
Every other build is named "Electric MC (test build vX)". The zip lands in
`build/`. Adding a permission later disables the extension for existing
users until they accept it, so any new permission needs agreeing first.

## Build and load

```sh
make update            # git pull, install packages if they changed, build
make build             # just build, into build/chrome-mv3
make                   # list every command (test, check, store, dev, clean…)
```

The same commands work from the top of the repository, and the `npm run`
scripts in `package.json` still work too.

In Chrome, open `chrome://extensions`, turn on **Developer mode**, click
**Load unpacked**, and pick `extension/build/chrome-mv3`. Pin the extension
and click its icon to open the side panel. `make dev` gives a live-reloading
build instead.

## Using it

- **On/off per site.** The switch at the top of the side panel, or
  right-clicking the toolbar icon, turns the extension off for the current
  site. The icon goes grey and shows `OFF`, and MC pages are left untouched.
- **Login.** On the login page the extension adds the hints password
  managers look for (`autocomplete="username"` and `current-password`), so
  1Password and Chrome should offer to fill it. The hints go on as the
  page loads, before the password manager looks. Optionally (Settings, off by
  default) it presses Log In once they fill both fields, at most once a minute
  so a wrong saved password can't loop. The extension
  can't read Chrome's saved passwords: Chrome has no API for that.
- **Revisions.** Queue rows for revisions (.R1, .R2, …) are bold on light
  yellow. Turn it off in Settings.
- **Earlier versions.** Every manuscript page you open records that
  version's AE and dates. On a revision's details page the extension writes
  each earlier version's AE under its ID in Version History. For versions it
  hasn't recorded, it looks them up offscreen. A hidden, sandboxed frame
  searches for the manuscript, presses Take Action and switches to each
  earlier version. The sandbox stops anything in that frame from changing
  your tab. The result is saved, so the lookup runs once per version. If
  the site won't load in a frame, the note asks you to open that version
  once instead. It also adds two rows at the bottom of Peer Review
  Milestones: when the previous version was submitted and its decision sent
  (with the days between), and that version's AE and co-chair. The decision
  date comes from the decision letter in the Audit Trail. When the
  backend exists it will answer from the assignment emails first. Everything
  Electric MC adds to a page is bold in its brown (#b45309).
- **Attach.** When you choose a file on an upload page, the extension
  presses that file's Attach button for you. It's on by default, and you can
  turn it off in Settings.
- **Developer mode** (Settings, off by default). Turns on the on-page debug
  pill, the page type on the toolbar icon, full parse results in the log, the
  Log tab, capture and the raw JSON. With it off, the log holds only problems.
- **Side panel only on MC.** The side panel appears only on Manuscript
  Central tabs. It hides when you switch to any other tab, follows you from
  one MC tab to the next, and the popped-out window stays.
- **Side panel, Page tab.** Everything parsed from the current tab. **Pop
  out** moves the panel into its own window, which follows whatever MC tab you
  are on; **Pop in** puts it back.
- **Seen tab.** Manuscripts seen so far, built from the pages you visit.
  Click an ID to open it: the extension runs MC's own search for it and
  presses Take Action on the result. Settings can also press Take Action
  after any search that finds a single manuscript (off by default). The
  real build will load this from the backend in one query.
- **Clickable IDs.** On MC's grids, the manuscript ID is a link that does
  what the Take Action checkbox does.
- **To EIC tab** (co-chairs only). When you recommend a decision under
  Co-Chair Recommends, the extension reads it from the manuscript's
  Recommendations box, adds it to the To EIC list, and notes it in brown in
  the grid's Status column ("you recommended Reject …; waiting for the
  EIC"), since MC keeps the manuscript in Awaiting AE Assignment. It leaves
  the list when the recommendation is gone (rescinded or acted on) or the
  decision letter is sent. **Copy summary for the EIC** copies the list as
  text. Only the recommendation is kept, never your comments.
- **Roles.** The extension learns which MC roles you have (EIC, co-chair,
  AE, reviewer, author) from the role switcher and the pages you visit, and
  remembers them when you switch roles. The To EIC tab appears once it has
  seen that you're a co-chair.
- **Notes tab.** Per-manuscript notes, stored only in this browser. They
  save as you type; there's no Save button.
- **Editorial matrix.** **Matrix** (top of the side panel) opens the
  Opinions editorial matrix in its own window: every column head, columnist
  and associate editor, with each one's current number of assigned
  manuscripts in bold brown. The counts are read from MC's Assign Associate
  Editor pull-down whenever it is on the page, and the window shows when they
  were read. The extension ships no names: press **Load roster…** and choose
  the `roster.json` that `make export` writes in
  [cacm-opn-dashboard](https://github.com/ustpc/cacm-opn-dashboard). Editors
  in MC's list who aren't in the roster are listed at the bottom.
- **Stored data.** Manuscripts you haven't viewed in 2 years, and their
  notes, are removed automatically. **Clear all data** (bottom of Settings)
  removes the Seen list, notes, log, AE counts and roster at once, and keeps
  your settings.
- **Log tab** (developer mode). The debug log. **Export for sharing (redacted)** saves a JSON
  file without names, titles, emails or manuscript IDs; send that one to us.
  **Export full** keeps everything, for your own use only.
- **Capture page HTML** (Page tab, developer mode) saves the current page to
  `Downloads/electric-mc/captures/`. Captures hold confidential manuscript
  data: keep them private and never commit them.
- **Settings tab.** Page layout: use
  the full window width (MC's column grows to half an inch from each edge)
  and a bigger text size than MC's 11px. Also each feature's switch, and
  developer mode. Preferences are kept in Chrome's sync storage, so they
  follow your Chrome profile to other computers; no Electric MC account is
  needed.

## Checking the parsers

```sh
npm test                 # fixtures + simulated template changes
npm run typecheck
npm run validate -- ~/Downloads/electric-mc/captures --mutate
```

`validate` re-parses captured pages, flags any whose page type changed since
capture, and with `--mutate` reports any capture whose result changes under
the simulated ScholarOne template changes in `tests/mutate.ts`. Add
`--json --redact` for output you can share.

When a real page parses wrongly, the fix is usually a new label or signal in
`parsers/classify.ts` or `parsers/extract.ts`, plus a synthetic fixture in
`tests/fixtures/` (made-up names and titles only) that reproduces it.
