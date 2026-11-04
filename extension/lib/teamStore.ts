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
