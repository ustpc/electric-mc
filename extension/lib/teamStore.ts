// Reading and storing the team database (lib/team.ts) in chrome.storage.local.
// Storing it also writes the roster derived from it (KEY.roster), which the
// Matrix rows, Suggested AEs and older code read. A browser that only has
// an older roster gets a team made from it the first time one is needed.

import { KEY } from './messages';
import { parseRoster, type Roster } from './roster';
import { emptyTeam, parseTeam, rosterFromTeam, teamFromRoster, type Team } from './team';

/** The stored team, or one made from an older stored roster, or an empty one. */
export async function currentTeam(): Promise<Team> {
  const got = await chrome.storage.local.get([KEY.team, KEY.roster]);
  const t = got[KEY.team] as Team | undefined;
  if (t) return t;
  const r = got[KEY.roster] as Roster | undefined;
  return r ? teamFromRoster(r) : emptyTeam('Opinions');
}

/** Check and store the team, and the roster derived from it. */
export async function storeTeam(team: Team): Promise<Team> {
  const t = parseTeam({ ...team, updatedAt: new Date().toISOString() });
  await chrome.storage.local.set({ [KEY.team]: t, [KEY.roster]: rosterFromTeam(t) });
  return t;
}

/** A team from a loaded file: a team file, or an older roster file converted. */
export function teamFromFile(json: unknown): Team {
  const f = (json as { format?: unknown } | null)?.format;
  if (f === 'electric-mc-roster') return teamFromRoster(parseRoster(json));
  return parseTeam(json);
}

/** The file name a team is saved under: "team-opinions.json". */
export function teamFileName(team: Team): string {
  return `team-${(team.name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team'}.json`;
}

function teamJson(team: Team): string {
  return JSON.stringify(parseTeam(team), null, 1) + '\n';
}

/** Save the team to a JSON file the person downloads (checked first, as a file loaded back would be). */
export function downloadTeamFile(team: Team, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([teamJson(team)], { type: 'application/json' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = teamFileName(team);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Saving to a file the person picks (the File System Access API, in Chrome's
// extension pages): the first save asks where, later saves write over that
// same file without asking. The file's handle is kept in this browser's
// IndexedDB (a handle can't go in chrome.storage); it holds no team data.
type Writable = { write(data: string): Promise<void>; close(): Promise<void> };
type Handle = {
  name: string;
  createWritable(): Promise<Writable>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
};
type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<Handle>;

const HANDLE_DB = 'emc-team-file';
const HANDLE_KEY = 'team';

function handleStore<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(HANDLE_DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('handles');
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        try {
          const req = act(open.result.transaction('handles', mode).objectStore('handles'));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      };
    } catch {
      resolve(undefined);
    }
  });
}

/** The name of the file later saves go to, if one was picked. */
export async function teamFileTarget(): Promise<string | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  return (await handleStore<Handle>('readonly', (s) => s.get(HANDLE_KEY) as IDBRequest<Handle>))?.name;
}

/**
 * Save the team to a file. With `pick` (or no file picked yet) Chrome's Save
 * dialog asks where; otherwise it writes over the file picked before. Where
 * the picker is missing it downloads instead. Returns the file's name, or
 * null when the person cancelled the dialog.
 */
export async function saveTeamFile(team: Team, opts: { pick?: boolean; win?: Window } = {}): Promise<string | null> {
  const win = opts.win ?? window;
  const picker = (win as Window & { showSaveFilePicker?: Picker }).showSaveFilePicker;
  if (typeof picker !== 'function' || typeof indexedDB === 'undefined') {
    downloadTeamFile(team, win.document);
    return `${teamFileName(team)} (in Downloads)`;
  }
  let handle = opts.pick ? undefined : await handleStore<Handle>('readonly', (s) => s.get(HANDLE_KEY) as IDBRequest<Handle>);
  if (handle?.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') handle = undefined;
  }
  if (!handle) {
    try {
      handle = await picker.call(win, { suggestedName: teamFileName(team), types: [{ description: 'E-MC team file', accept: { 'application/json': ['.json'] } }] });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
    await handleStore('readwrite', (s) => s.put(handle, HANDLE_KEY));
  }
  const w = await handle.createWritable();
  await w.write(teamJson(team));
  await w.close();
  return handle.name;
}

/** Forget which file team saves go to (Clear all data); the file itself stays. */
export async function forgetTeamFile(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await handleStore('readwrite', (s) => s.delete(HANDLE_KEY));
}
