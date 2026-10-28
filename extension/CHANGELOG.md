# Electric MC extension changelog

Newest first. Every version bump gets an entry here.

## 0.0.40 (2026-10-28)

- Notes are signed. Each one shows its author and the time its editing session began. Typing keeps updating the same note, and after an hour away your next note starts fresh. Authors can edit or delete their own notes; co-chairs and the EIC can delete any note.
- The extension reads who is logged in from MC's page, and asks once for the name to put on your notes. If it differs from MC's name, notes show both: "Pat Example (Opinions Co-Chair)".
- Optional notes server (Settings > Notes server): notes are shared through a small AWS Lambda (`backend/notes`). Each browser makes its own signing key, which can't be copied out of it. Requests carry a hash of the manuscript's title, never the title. The project owner can ban a key. No new permission.
- Notes from earlier versions become your notes, dated when you upgrade.

## 0.0.39 (2026-10-28)

- On MC's login page, the two "Create an Account" links stay where they were and still work, but are drawn as pictures of the words "New Account". 0.0.38 showed that their wording was what made 1Password offer to generate a password instead of filling your login. The "more..." button is gone.

## 0.0.38 (2026-10-27)

- On MC's login page, the two "Create an Account" links are replaced by one bold brown "more..." button that brings them back when clicked, in case the sign-up wording makes 1Password offer to generate a password instead of filling your login.

## 0.0.37 (2026-10-27)

- Fixed: the side panel wouldn't open on an MC tab that had been on another page before (often the new-tab page), after the extension was reloaded or updated.
- Clickable manuscript IDs on the grids are now bold E-MC brown, so you can see they're links.

## 0.0.36 (2026-10-27)

- Fixed: after the extension learned a new MC role, it stopped saving anything (the log, the Seen list, the To EIC list) until Chrome restarted its background script. With the live log keeping that script awake, it never recovered.

## 0.0.35 (2026-10-27)

- Removed: the background lookup of earlier versions' AEs. It loaded MC pages beside your tab and logged you out. Earlier versions' AEs now come only from versions you've opened; open each original once and its AE shows on the revision.
- The live log helper is now a small Python program, tested end to end with Chrome; the Log tab shows the file it writes to, or why it isn't available.

## 0.0.34 (2026-10-27)

- Live log file for developers: in Developer mode, test builds append every log entry to `var/electric-mc.log` in the repository on your own computer, as it happens. Set it up once with `make install-log-host`. It needs the new `nativeMessaging` permission, in test builds only; the Web Store build doesn't have it.

## 0.0.33 (2026-10-24)

- Manuscript IDs on MC's grids are links that do what the Take Action checkbox does.
- New To EIC tab for co-chairs: your recommendations to the EIC, read from each manuscript's Recommendations box, also noted in the grid's Status column until the EIC acts. Copy summary for the EIC copies the list.
- The extension learns your MC roles (EIC, co-chair, AE, reviewer, author) as you use MC and remembers them across role switches.

## 0.0.32 (2026-10-23)

- New: the Opinions editorial matrix, in its own window (**Matrix** at the top of the side panel). It shows each column head's and AE's current number of assigned manuscripts, read from MC's Assign Associate Editor pull-down whenever you open it.
- The matrix's roster is loaded from a file (`make export` in cacm-opn-dashboard); the extension itself carries no names.
- Clear all data also removes the AE counts and the roster.

## 0.0.31 (2026-10-22)

- Notes save themselves as you type (and when you leave the box or switch manuscripts). The Save button is gone.

## 0.0.30 (2026-10-22)

- Manuscripts you haven't viewed in 2 years are removed automatically, with their notes.
- New "Clear all data" button at the bottom of Settings: removes the Seen list, notes and log, and keeps your settings.

## 0.0.29 (2026-10-22)

- Fixed: the side panel could say "This tab is running an older build" on an up-to-date tab while MC was between pages. It now asks again and checks once more when the page finishes loading.
- Fixed: "AE: Not Assigned" on the current page could be saved as that version's AE.

## 0.0.28 (2026-10-22)

- Fixed: the side panel could not be opened in 0.0.27.
- A tab that comes to MC from another site gets its own panel, which doesn't follow you to other tabs.

## 0.0.27 (2026-10-22)

- The side panel now hides on pages that aren't Manuscript Central, and still follows you across MC tabs.

## 0.0.26 (2026-10-21)

- Earlier versions' AE is looked up offscreen again, in a sealed frame that can't change your page.
- The Version History note says "AE: looking it up…" while the lookup runs.
- Version History drawn after the page loads is picked up too.

## 0.0.25 (2026-10-21)

- Fixed: opening a revision no longer switches the page to the original version.
- Earlier versions' AE now comes from versions you've viewed. Open each earlier version once and its AE shows up on the revision.
- Choosing a file to upload now presses its Attach button for you. You can turn this off in Settings.
- Fixed: a false "reviewers mentioned but not parsed" warning on manuscripts whose notes mention reviewers but that have no reviewers yet.
- New: this changelog.

## 0.0.24 (2026-10-21)

- Search box on the Seen tab: filters by ID or title, ignoring case.

## 0.0.23 (2026-10-21)

- MC's javascript: links are clicked from the page's own world, so Take Action, the Seen search and the Audit Trail lookup no longer fail with CSP errors.
- No more "No tab with id" errors when a tab closes early.

## 0.0.22 (2026-10-21)

- Earlier versions' AE and co-chair are read from MC's editor block.
- A Status | History header no longer reads as status "History".

## 0.0.21 (2026-10-19)

- `STORE=1` builds the Chrome Web Store package.

## 0.0.20 (2026-10-19)

- New setting (off by default): hide MC's page-title image and the empty column beside it.
- Fixed: Take Action after a search was blocked by the Search Criteria line.

## 0.0.19 (2026-10-19)

- A search that finds one manuscript is read as a results list, not a manuscript page.
- Queue status shows as lines in Seen.

## 0.0.18 (2026-10-19)

- Click an ID in Seen to open that manuscript.
- New setting (off by default): Take Action after any search that finds a single manuscript.

## 0.0.17 (2026-10-19)

- Queue rows with per-action Status tables are parsed, so revisions are highlighted there too.
- Full width picks the right column.
- Milestone rows go at the bottom of Peer Review Milestones.

## 0.0.16 (2026-10-18)

- The side panel flags tabs still running an old build and offers to reload them.

## 0.0.15 (2026-10-18)

- Login fields are labeled before password managers scan the page.
- Auto-login is now an opt-in setting.

## 0.0.14 (2026-10-18)

- Login help on any page with exactly one password field.

## 0.0.13 (2026-10-18)

- New icon: MC with a lightning bolt through it, grey when switched off.

## 0.0.12 (2026-10-18)

- Builds go into `build/` (load unpacked from `build/chrome-mv3`).

## 0.0.11 (2026-10-18)

- Page layout preferences moved into the Settings tab.

## 0.0.10 (2026-10-18)

- Renumbered under semantic versioning; the version shows in the name and side panel.
