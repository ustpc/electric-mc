// The Opinions roster for the editorial matrix. The extension carries no
// names: the person loads roster.json, exported by cacm-opn-dashboard
// (`make export`), and it stays in this browser's chrome.storage.local.
// Everything in it is checked here before it is stored or shown.

export const GROUPS = [
  { id: 'leadership', title: 'Editor-in-chief and co-chairs' },
  { id: 'column_heads', title: 'Column heads' },
  { id: 'columnists', title: 'Columnists' },
  { id: 'associate_editors', title: 'Associate Editors' },
] as const;

export type GroupId = (typeof GROUPS)[number]['id'];

export interface RosterPerson {
  id: string;
  name: string;
  group: GroupId;
  /** Display labels, such as "Opinions Co-Chair" or "Inside Risks Column Head". */
  roles: string[];
  /** Whether this person heads a column or is an associate editor: they take assignments. */
  assignable: boolean;
  /** Ids of people who head the same column. */
  coheads: string[];
  affiliations: string[];
  mastheadAffiliation?: string;
  /** The masthead affiliation is out of date. */
  affiliationMismatch?: boolean;
  expertise: string;
  notes?: string;
  homepage?: string;
  email?: string;
  linkedin?: string;
  acmDl?: string;
  /** A data: URL of a JPEG or PNG headshot. */
  portrait?: string;
  initials: string;
}

export interface Roster {
  format: 'electric-mc-roster';
  version: 1;
  section: string;
  researchedOn: string;
  mastheadSource?: string;
  /** When cacm-opn-dashboard wrote the file. */
  exportedAt: string;
  people: RosterPerson[];
}

/** Lowercase without accents, for comparing names and searching. */
export function fold(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

class Invalid extends Error {}

const str = (v: unknown, what: string, max = 2000): string => {
  if (typeof v !== 'string' || v.length > max) throw new Invalid(`${what} must be text`);
  return v;
};
const opt = (v: unknown, what: string, max = 2000): string | undefined => (v === undefined || v === null ? undefined : str(v, what, max));
const strs = (v: unknown, what: string): string[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 50) throw new Invalid(`${what} must be a list`);
  return v.map((x, i) => str(x, `${what}[${i}]`));
};
const url = (v: unknown, what: string): string | undefined => {
  const s = opt(v, what);
  if (s === undefined) return undefined;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Invalid(`${what} is not a link`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Invalid(`${what} must be an http(s) link`);
  return u.href;
};
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PORTRAIT = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
const GROUP_IDS = new Set<string>(GROUPS.map((g) => g.id));

/** The roster in a loaded file, or an Error saying what's wrong with it. */
export function parseRoster(json: unknown): Roster {
  const r = json as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || r.format !== 'electric-mc-roster') throw new Invalid('This is not an Electric MC roster file (roster.json from `make export`).');
  if (r.version !== 1) throw new Invalid(`Roster version ${String(r.version)} is newer than this extension understands.`);
  if (!Array.isArray(r.people) || !r.people.length || r.people.length > 500) throw new Invalid('The roster has no people.');
  const ids = new Set<string>();
  const people = r.people.map((raw, i): RosterPerson => {
    const p = raw as Record<string, unknown>;
    const at = `people[${i}]`;
    const id = str(p.id, `${at}.id`, 100);
    if (ids.has(id)) throw new Invalid(`${at}.id ${id} appears twice`);
    ids.add(id);
    const group = str(p.group, `${at}.group`);
    if (!GROUP_IDS.has(group)) throw new Invalid(`${at}.group ${group} is not a known section`);
    const email = opt(p.email, `${at}.email`, 200);
    if (email && !EMAIL.test(email)) throw new Invalid(`${at}.email is not an email address`);
    const portrait = opt(p.portrait, `${at}.portrait`, 2_000_000);
    if (portrait && !PORTRAIT.test(portrait)) throw new Invalid(`${at}.portrait must be a JPEG or PNG data URL`);
    return {
      id,
      name: str(p.name, `${at}.name`, 200),
      group: group as GroupId,
      roles: strs(p.roles, `${at}.roles`),
      assignable: p.assignable === true,
      coheads: strs(p.coheads, `${at}.coheads`),
      affiliations: strs(p.affiliations, `${at}.affiliations`),
      mastheadAffiliation: opt(p.mastheadAffiliation, `${at}.mastheadAffiliation`),
      affiliationMismatch: p.affiliationMismatch === true,
      expertise: str(p.expertise ?? '', `${at}.expertise`),
      notes: opt(p.notes, `${at}.notes`),
      homepage: url(p.homepage, `${at}.homepage`),
      email,
      linkedin: url(p.linkedin, `${at}.linkedin`),
      acmDl: url(p.acmDl, `${at}.acmDl`),
      portrait,
      initials: str(p.initials ?? '', `${at}.initials`, 4),
    };
  });
  return {
    format: 'electric-mc-roster',
    version: 1,
    section: str(r.section, 'section', 100),
    researchedOn: str(r.researchedOn, 'researchedOn', 40),
    mastheadSource: url(r.mastheadSource, 'mastheadSource'),
    exportedAt: str(r.exportedAt ?? '', 'exportedAt', 40),
    people,
  };
}

/** Whether the person's words all appear somewhere in this person's row. */
export function matchesSearch(p: RosterPerson, query: string, extra = ''): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const row = fold([p.name, ...p.roles, ...p.affiliations, p.mastheadAffiliation ?? '', p.expertise, p.notes ?? '', extra].join(' '));
  return words.every((w) => row.includes(w));
}
