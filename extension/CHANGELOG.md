# Electric MC extension changelog

Newest first. Every version bump gets an entry here.

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
