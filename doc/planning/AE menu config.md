# AE menu config: local now, shared later

Extension 0.0.51 regroups MC's Assign Associate Editor pull-down by a config
(`extension/lib/aemenu.ts`). This note records how the config works today and
how a shared server copy should work when it is built.

## Today: this browser's config

- Stored in `chrome.storage.local` under `aeMenu` as
  `{ source: 'local' | 'server', local?, server?, serverFetchedAt? }`.
- Edited as JSON in Settings > AE assignment menu, started from the Opinions
  co-chair layout, or loaded from / saved to `ae-menu.json`.
- Groups normally take their members from a roster section
  (`rosterGroup`), so the config itself names no one. `names` lets a person
  pin specific editors to a group; those names stay in that browser.
- The repository never holds a real config. Real ones live in local storage
  or in `var/` (git-ignored).

Format (version 1):

```json
{
  "format": "electric-mc-ae-menu",
  "version": 1,
  "profile": "Opinions co-chair",
  "enabled": true,
  "fontSize": 0,
  "fontFamily": "",
  "sort": "mc",
  "groups": [
    { "label": "Column heads", "rosterGroup": "column_heads", "color": "#7a3e00", "bold": true, "names": [] },
    { "label": "Opinions AEs", "rosterGroup": "associate_editors", "color": "#1d4ed8", "names": [] }
  ],
  "rest": { "label": "Other AEs", "color": "#6b7280" }
}
```

## Later: a shared copy on the notes server

So every co-chair sees the same grouping without passing files around.

- **Storage.** One item per section and profile in the notes table, for
  example `pk = "config#ae-menu"`, `sk = "<profile>"`, holding the config JSON,
  who last wrote it and when.
- **Reading.** Any registered key may read (`op: "config-get"`). The
  extension keeps the last copy as `aeMenu.server`, so the menu works
  offline, and the person chooses whether the menu follows it.
- **Writing.** `op: "config-put"`, signed like a note. The server accepts it
  only from keys whose registered MC identity is a co-chair or EIC, the
  same rule as deleting anyone's note. The extension's "Send mine to the
  server" button calls this; it is a stub (`pushServerAeMenu`) until then.
- **Copying.** "Copy server config here" copies `aeMenu.server` into
  `aeMenu.local`, so a person can start from the shared layout and adjust it
  for themselves.
- **Privacy.** A config with `names` would put editors' names on the
  server. Editor names are already there with notes' authors; still, the
  server copy should prefer `rosterGroup` and the panel should warn before
  sending a config that has names.
