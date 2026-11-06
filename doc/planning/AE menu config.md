# AE menu config and team database: local now, DynamoDB later

Extension 0.0.51 groups, relabels and colors MC's Assign Associate Editor
pull-down by a config (`extension/lib/aemenu.ts`). This note records how
the config works today and how the shared store on the notes server should
work when it is built.

## The config

A table-driven JSON file. The copy shipped with the extension,
`extension/config/ae-menu.json`, is the Opinions co-chair layout with an
**empty table**. Real tables name real editors, so they never go in this
repository: they live in a browser's `chrome.storage.local`, in files the
person saves, or in `var/` (git-ignored).

```json
{
  "format": "electric-mc-ae-menu",
  "version": 1,
  "profile": "Opinions co-chair",
  "enabled": true,
  "fontSize": 0,
  "fontFamily": "",
  "sort": "mc",
  "label": "{section} - {given} {family}",
  "people": [
    { "given": "Pat", "family": "Editor", "section": "Example Column", "email": "pat@example.org" }
  ],
  "groups": [
    { "label": "Column heads", "fromTable": true, "rosterGroup": "column_heads", "color": "#7a3e00", "bold": true },
    { "label": "Opinions AEs", "rosterGroup": "associate_editors", "color": "#1d4ed8" }
  ],
  "rest": { "label": "Other AEs", "color": "#6b7280" }
}
```

- `people` is the table. Each row is matched to MC's "Family, Given" entry
  and shown with `label`, so MC's "Editor, Pat (3)" becomes
  "Example Column - Pat Editor (3)". MC's count stays; the option's value
  never changes, and MC's own text is kept on the option so workload counts
  still read correctly.
- `groups` are in menu order, each under a divider. A person goes in the
  first group that claims them: `names` typed into the JSON, then the table
  (`fromTable`: `true` for everyone in it, or a list of sections), then a
  section of the roster loaded in the Matrix window (`rosterGroup`).
  Everyone else goes in `rest`.

## Today: this browser

- Stored under `aeMenu` in `chrome.storage.local`:
  `{ source: 'local' | 'server', local?, server?, serverName?, serverFetchedAt? }`.
- Settings > AE assignment menu turns it on, picks this browser's config or
  the downloaded server copy, copies the server copy here for editing, and
  opens the editor window.
- The editor (`entrypoints/aemenu`) edits the table (rows, paste from a
  spreadsheet, sort), the label, the groups and their styles, and the menu
  font and order; saves to and loads from a JSON file; previews the result
  on a copy of the last pull-down MC showed; and marks table rows MC's
  pull-down doesn't list.

## Later: configs in DynamoDB

The notes server (`backend/notes`, one DynamoDB table with `pk`/`sk`) gets
a small config store. No Cognito: every request is already signed with the
browser's registered key, and the server knows each key's email.

**Items**

| item        | pk         | sk            | attributes                                        |
|-------------|------------|---------------|---------------------------------------------------|
| a config    | `config`   | `ae-menu#<name>` | `body` (the JSON), `savedBy`, `savedAt`, `people` (count) |

`<name>` is the config's `profile`, trimmed, at most 80 characters.

**Operations** (signed envelopes, like the notes ones)

| op               | who                 | does                                                   |
|------------------|---------------------|--------------------------------------------------------|
| `config-list`    | any registered key  | Query `pk = config`, `begins_with(sk, "ae-menu#")`; returns name, savedAt, savedBy, people for each, without bodies |
| `config-get`     | any registered key  | Returns one config's body                              |
| `config-put`     | owner only          | Validates the body (same rules as `parseAeMenu`, size under 200 KB) and writes it, replacing any config of that name |
| `config-delete`  | owner only          | Deletes one config                                     |

"Owner" is the existing `OWNERS` list (Simson), the same check that guards
bans and key listing; a banned key or email is refused as everywhere else.
Writes record who and when. The extension's client calls already exist as
stubs (`listServerConfigs`, `getServerConfig`, `saveServerConfig`,
`deleteServerConfig` in `lib/aemenu.ts`) and the editor's Server section
calls them; building the server side means filling those in and adding the
four ops and their tests to `backend/notes`.

**Downloading** keeps the copy as `aeMenu.server`, so the menu works without
the server, and the person chooses in Settings whether the menu follows it
or their own copy. "Copy the server's config here" copies it into
`aeMenu.local` to edit.

**Privacy.** A config on the server names editors and may hold their
emails. Editor names are already on the server as note authors, and only
registered keys can read configs. The editor should still warn before the
admin uploads a config with emails, and offer to leave them out.

## Update (0.0.54): the team database

The people table moved out of the AE menu config into the team database
(`extension/lib/team.ts`, stored under `team`; the older `roster` is derived
from it). AE menu groups now say which parts of the team they take
(`take`: `leaders`, `heads`, `aes`, `columnists`, with optional `sections`),
and `{section}` in a label is all of a person's sections. Configs written
before this still load: `rosterGroup` and `fromTable` become `take`.

The server store should hold team files the same way as AE menu configs:
`sk = "team#<name>"`, the same list and get for any registered key, and the
same owner-only put and delete. Photos make a team file large (about 15 KB
per person when uploaded here); if it grows past DynamoDB's 400 KB item
limit, keep photos in S3 and store only their keys in the item.
