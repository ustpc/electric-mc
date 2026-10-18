# Electric MC test extension

A Chrome extension for trying out the Manuscript Central page parsers. It
parses every `*.manuscriptcentral.com` page you open, rewrites the page title
so history and the Back menu make sense, shows a small debug badge, and logs
what it found. Nothing leaves your machine: there is no backend yet.

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
- **Badge.** Off by default now that the side panel shows the same thing.
  When on (Settings), it's a small pill in the bottom-left corner. Click it
  for the signals, strategies and warnings; × hides it on that page. The toolbar icon also shows the page type (`MS`, `LIST`,
  `CTR`, …); it turns orange when there are warnings.
- **Side panel, Page tab.** Everything parsed from the current tab. **Pop
  out** moves the panel into its own window, which follows whatever MC tab you
  are on; **Pop in** puts it back.
- **Seen tab.** Manuscripts seen so far, built from the pages you visit. The
  real build will load this from the backend in one query.
- **Notes tab.** Per-manuscript notes, stored only in this browser.
- **Log tab.** The debug log. **Export for sharing (redacted)** saves a JSON
  file without names, titles, emails or manuscript IDs; send that one to us.
  **Export full** keeps everything, for your own use only.
- **Capture page HTML** (Page tab) saves the current page to
  `Downloads/electric-mc/captures/`. Captures hold confidential manuscript
  data: keep them private and never commit them.
- **Settings tab.** Turn the badge or title rewriting off, log every
  re-parse, or override the manuscript ID pattern.

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
