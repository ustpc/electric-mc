# Electric MC test extension

A Chrome extension for trying out the Manuscript Central page parsers. It
parses every `*.manuscriptcentral.com` page you open, rewrites the page title
so history and the Back menu make sense, highlights revisions, fills in what
earlier versions of a revision looked like, and logs problems. Nothing leaves your machine: there is no backend yet.

Design notes are in
[Technical Stack and Architecture.md](../doc/Technical%20Stack%20and%20Architecture.md#65-test-extension-built-2026-10-18).

## Build and load

```sh
cd extension
npm install
npm run build          # writes .output/chrome-mv3
```

In Chrome, open `chrome://extensions`, turn on **Developer mode**, click
**Load unpacked**, and pick `extension/.output/chrome-mv3`. Pin the extension
and click its icon to open the side panel. `npm run dev` gives a live-reloading
build instead.

## Using it

- **On/off per site.** The switch at the top of the side panel, or
  right-clicking the toolbar icon, turns the extension off for the current
  site. The icon goes grey and shows `OFF`, and MC pages are left untouched.
- **Login.** On the login page the extension adds the hints password
  managers look for (`autocomplete="username"` and `current-password`), so
  1Password and Chrome should offer to fill it. Once they fill both fields
  without you typing, it presses Log In for you, at most once a minute so a
  wrong saved password can't loop. Turn that off in Settings. The extension
  can't read Chrome's saved passwords: Chrome has no API for that.
- **Revisions.** Queue rows for revisions (.R1, .R2, …) are bold on light
  yellow. Turn it off in Settings.
- **Earlier versions.** On a revision's details page the extension opens each
  earlier version in a hidden frame (you stay on the page), writes its AE
  under its ID in Version History, and adds two rows under Peer Review
  Milestones: when the previous version was submitted and its decision sent
  (with the days between), and that version's AE and co-chair. The decision
  date comes from the decision letter in the Audit Trail. When the
  backend exists it will answer from the assignment emails first. Everything
  Electric MC adds to a page is bold in its brown (#b45309).
- **Developer mode** (Settings, off by default). Turns on the on-page debug
  pill, the page type on the toolbar icon, full parse results in the log, the
  Log tab, capture and the raw JSON. With it off, the log holds only problems.
- **Side panel, Page tab.** Everything parsed from the current tab. **Pop
  out** moves the panel into its own window, which follows whatever MC tab you
  are on; **Pop in** puts it back.
- **Seen tab.** Manuscripts seen so far, built from the pages you visit. The
  real build will load this from the backend in one query.
- **Notes tab.** Per-manuscript notes, stored only in this browser.
- **Log tab** (developer mode). The debug log. **Export for sharing (redacted)** saves a JSON
  file without names, titles, emails or manuscript IDs; send that one to us.
  **Export full** keeps everything, for your own use only.
- **Capture page HTML** (Page tab, developer mode) saves the current page to
  `Downloads/electric-mc/captures/`. Captures hold confidential manuscript
  data: keep them private and never commit them.
- **Settings tab.** Switch each feature off, turn on developer mode, or (in
  developer mode) override the manuscript ID pattern.

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
