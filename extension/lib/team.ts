// The editorial team database: one record of who is on the publication's
// team and how it is organized, which the Matrix window, the AE menu
// (lib/aemenu.ts) and Suggested AEs all read. At the top are the leaders
// (EIC, Deputy EIC, co-chairs). Sections have heads and AEs; an AE may be in
// several sections or none. Columns have columnists; a column inside a
// section reports to that section's heads, and one outside reports to the
// co-chairs as a group. Each person has one MC account email (shared
// accounts are marked), links, and an optional small photo. The extension
// ships no team: the person loads or builds one, and it is kept in
// chrome.storage.local (KEY.team). The older roster format (lib/roster.ts) is
// derived from it, so existing readers keep working.

import { fold, type GroupId, type Roster, type RosterPerson } from './roster';

export type LeaderRole = 'eic' | 'deputy-eic' | 'co-chair';
export const LEADER_LABEL: Record<LeaderRole, string> = { eic: 'Editor-in-Chief', 'deputy-eic': 'Deputy Editor-in-Chief', 'co-chair': 'Co-Chair' };

export interface TeamLink {
  label: string;
  url: string;
}

export interface TeamPerson {
  id: string;
  given: string;
  family: string;
  /** The email of their MC account. */
  email?: string;
  /** A shared MC account (such as the co-chairs'), not one person. */
  shared?: boolean;
  /** Takes AE assignments; shown as an unassigned AE when in no section. */
  ae?: boolean;
  affiliations: string[];
  mastheadAffiliation?: string;
  expertise: string;
  notes?: string;
  links: TeamLink[];
  /** A data: URL of a JPEG or PNG photo, at most 256px a side when uploaded here. */
  portrait?: string;
}

export interface TeamSection {
  id: string;
  name: string;
  heads: string[];
  aes: string[];
}

export interface TeamColumn {
  id: string;
  name: string;
  /** The section it belongs to; none means its columnists report to the co-chairs. */
  section?: string;
  columnists: string[];
}

export interface Team {
  format: 'electric-mc-team';
  version: 1;
  /** The part of the publication, such as "Opinions". */
  name: string;
  updatedAt: string;
  leaders: Array<{ person: string; role: LeaderRole }>;
  sections: TeamSection[];
  columns: TeamColumn[];
  people: TeamPerson[];
}

export function emptyTeam(name = ''): Team {
  return { format: 'electric-mc-team', version: 1, name, updatedAt: new Date().toISOString(), leaders: [], sections: [], columns: [], people: [] };
}

export const fullName = (p: Pick<TeamPerson, 'given' | 'family'>) => `${p.given} ${p.family}`.trim();

/** A new id that isn't in use: "p-pat-editor", "s-privacy", with a number when taken. */
export function newId(prefix: string, name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = `${prefix}-${fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new'}`;
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  return id;
}

class Invalid extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PORTRAIT = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
const ID = /^[A-Za-z0-9_.:-]{1,100}$/;

function text(v: unknown, at: string, max: number, required = false): string {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' || v.length > max) throw new Invalid(`${at} must be text (up to ${max} characters)`);
  const t = v.trim();
  if (required && !t) throw new Invalid(`${at} can't be blank`);
  return t;
}
const opt = (v: unknown, at: string, max = 2000) => text(v, at, max) || undefined;
function list(v: unknown, at: string, max = 200): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) throw new Invalid(`${at} must be a list`);
  return v;
}
function link(v: unknown, at: string): TeamLink {
  const l = v as Record<string, unknown> | null;
  if (!l || typeof l !== 'object') throw new Invalid(`${at} must be a link`);
  const url = text(l.url, `${at}.url`, 2000, true);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Invalid(`${at}.url is not a link`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Invalid(`${at}.url must be an http(s) link`);
  return { label: text(l.label, `${at}.label`, 60) || u.hostname, url: u.href };
}

/** A team from JSON, checked, or an Error saying what's wrong with it. */
export function parseTeam(json: unknown): Team {
  const r = json as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || r.format !== 'electric-mc-team') throw new Invalid('This is not an Electric MC team file ("format": "electric-mc-team").');
  if (r.version !== 1) throw new Invalid(`Team file version ${String(r.version)} is newer than this extension understands.`);
  const ids = new Set<string>();
  const people = list(r.people, 'people', 1000).map((raw, i): TeamPerson => {
    const at = `people[${i}]`;
    const p = raw as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') throw new Invalid(`${at} must be an object`);
    const id = text(p.id, `${at}.id`, 100, true);
    if (!ID.test(id) || ids.has(id)) throw new Invalid(`${at}.id ${id} is not a usable id or appears twice`);
    ids.add(id);
    const out: TeamPerson = {
      id,
      given: text(p.given, `${at}.given`, 100),
      family: text(p.family, `${at}.family`, 100, true),
      affiliations: list(p.affiliations, `${at}.affiliations`, 20).map((a, j) => text(a, `${at}.affiliations[${j}]`, 300)).filter(Boolean),
      expertise: text(p.expertise, `${at}.expertise`, 4000),
      links: list(p.links, `${at}.links`, 30).map((l, j) => link(l, `${at}.links[${j}]`)),
    };
    const email = opt(p.email, `${at}.email`, 200);
    if (email) {
      if (!EMAIL.test(email)) throw new Invalid(`${at}.email is not an email address`);
      out.email = email;
    }
    if (p.shared === true) out.shared = true;
    if (p.ae === true) out.ae = true;
    const masthead = opt(p.mastheadAffiliation, `${at}.mastheadAffiliation`, 300);
    if (masthead) out.mastheadAffiliation = masthead;
    const notes = opt(p.notes, `${at}.notes`, 4000);
    if (notes) out.notes = notes;
    const portrait = opt(p.portrait, `${at}.portrait`, 2_000_000);
    if (portrait) {
      if (!PORTRAIT.test(portrait)) throw new Invalid(`${at}.portrait must be a JPEG or PNG data URL`);
      out.portrait = portrait;
    }
    return out;
  });
  const who = (v: unknown, at: string): string => {
    const id = text(v, at, 100, true);
    if (!ids.has(id)) throw new Invalid(`${at} names ${id}, who isn't in people`);
    return id;
  };
  const whos = (v: unknown, at: string) => [...new Set(list(v, at, 500).map((x, i) => who(x, `${at}[${i}]`)))];
  const leaders = list(r.leaders, 'leaders', 20).map((raw, i) => {
    const l = raw as Record<string, unknown>;
    const role = l?.role;
    if (role !== 'eic' && role !== 'deputy-eic' && role !== 'co-chair') throw new Invalid(`leaders[${i}].role must be eic, deputy-eic or co-chair`);
    return { person: who(l.person, `leaders[${i}].person`), role: role as LeaderRole };
  });
  const sectionIds = new Set<string>();
  const sections = list(r.sections, 'sections', 100).map((raw, i): TeamSection => {
    const at = `sections[${i}]`;
    const s = raw as Record<string, unknown>;
    const id = text(s?.id, `${at}.id`, 100, true);
    if (!ID.test(id) || sectionIds.has(id)) throw new Invalid(`${at}.id ${id} is not a usable id or appears twice`);
    sectionIds.add(id);
    return { id, name: text(s.name, `${at}.name`, 100, true), heads: whos(s.heads, `${at}.heads`), aes: whos(s.aes, `${at}.aes`) };
  });
  const columnIds = new Set<string>();
  const columns = list(r.columns, 'columns', 200).map((raw, i): TeamColumn => {
    const at = `columns[${i}]`;
    const c = raw as Record<string, unknown>;
    const id = text(c?.id, `${at}.id`, 100, true);
    if (!ID.test(id) || columnIds.has(id)) throw new Invalid(`${at}.id ${id} is not a usable id or appears twice`);
    columnIds.add(id);
    const out: TeamColumn = { id, name: text(c.name, `${at}.name`, 100, true), columnists: whos(c.columnists, `${at}.columnists`) };
    const section = opt(c.section, `${at}.section`, 100);
    if (section) {
      if (!sectionIds.has(section)) throw new Invalid(`${at}.section names ${section}, which isn't a section`);
      out.section = section;
    }
    return out;
  });
  return {
    format: 'electric-mc-team',
    version: 1,
    name: text(r.name, 'name', 100),
    updatedAt: text(r.updatedAt, 'updatedAt', 40),
    leaders,
    sections,
    columns,
    people,
  };
}

/** Everything a person does on the team, for labels, the matrix and the AE menu. */
export interface Placement {
  leader: LeaderRole[];
  heads: TeamSection[];
  aeIn: TeamSection[];
  columns: TeamColumn[];
}

export function placementOf(team: Team, id: string): Placement {
  return {
    leader: team.leaders.filter((l) => l.person === id).map((l) => l.role),
    heads: team.sections.filter((s) => s.heads.includes(id)),
    aeIn: team.sections.filter((s) => s.aes.includes(id)),
    columns: team.columns.filter((c) => c.columnists.includes(id)),
  };
}

/** Whether a person takes AE assignments: heads a section, is an AE in one, or is marked as an AE. */
export function assignable(team: Team, p: TeamPerson): boolean {
  const at = placementOf(team, p.id);
  return !!p.ae || at.heads.length > 0 || at.aeIn.length > 0;
}

/** AEs in no section, for the tree's "Unassigned" row. */
export function unassignedAes(team: Team): TeamPerson[] {
  return team.people.filter((p) => {
    const at = placementOf(team, p.id);
    return p.ae && !at.heads.length && !at.aeIn.length;
  });
}

/** People on no part of the tree at all. */
export function unplaced(team: Team): TeamPerson[] {
  return team.people.filter((p) => {
    const at = placementOf(team, p.id);
    return !p.ae && !at.leader.length && !at.heads.length && !at.aeIn.length && !at.columns.length;
  });
}

/**
 * The names that go before a person in the AE menu ("Education / Privacy"):
 * their sections (headed or as an AE), else their columns, else their
 * leadership role.
 */
export function sectionLabel(team: Team, id: string): string {
  const at = placementOf(team, id);
  const sections = [...new Set([...at.heads, ...at.aeIn].map((s) => s.name))];
  if (sections.length) return sections.join(' / ');
  if (at.columns.length) return at.columns.map((c) => c.name).join(' / ');
  return at.leader.map((r) => LEADER_LABEL[r]).join(' / ');
}

const initials = (p: TeamPerson) => ((p.given[0] ?? '') + (p.family[0] ?? '')).toUpperCase();

/** The team as the older roster (lib/roster.ts) that the matrix and Suggested AEs read. */
export function rosterFromTeam(team: Team): Roster {
  const byId = new Map(team.people.map((p) => [p.id, p]));
  const people = team.people.map((p): RosterPerson => {
    const at = placementOf(team, p.id);
    const group: GroupId = at.leader.length ? 'leadership' : at.heads.length ? 'column_heads' : p.ae || at.aeIn.length ? 'associate_editors' : 'columnists';
    const roles = [
      ...at.leader.map((r) => (r === 'co-chair' && team.name ? `${team.name} Co-Chair` : LEADER_LABEL[r])),
      ...at.heads.map((s) => `${s.name} Head`),
      ...at.aeIn.map((s) => `${s.name} Associate Editor`),
      ...(p.ae && !at.aeIn.length && !at.heads.length ? ['Associate Editor'] : []),
      ...at.columns.map((c) => `${c.name} Columnist`),
    ];
    const coheads = [...new Set(at.heads.flatMap((s) => s.heads).filter((h) => h !== p.id && byId.has(h)))];
    const find = (re: RegExp) => p.links.find((l) => re.test(l.label))?.url;
    return {
      id: p.id,
      name: fullName(p),
      group,
      roles,
      assignable: assignable(team, p),
      coheads,
      affiliations: p.affiliations,
      mastheadAffiliation: p.mastheadAffiliation,
      expertise: p.expertise,
      notes: p.notes,
      homepage: find(/home ?page|website/i),
      email: p.email,
      linkedin: find(/linkedin/i),
      acmDl: find(/acm ?dl|digital library/i),
      links: p.links,
      portrait: p.portrait,
      initials: initials(p),
    };
  });
  return {
    format: 'electric-mc-roster',
    version: 1,
    section: team.name,
    researchedOn: team.updatedAt.slice(0, 10),
    exportedAt: team.updatedAt,
    people,
  };
}

/** A team from an older roster file: leaders and section heads from its roles, AEs unassigned. */
export function teamFromRoster(r: Roster): Team {
  const team = emptyTeam(r.section);
  const sectionOf = new Map<string, TeamSection>();
  const columnOf = new Map<string, TeamColumn>();
  for (const rp of r.people) {
    const words = rp.name.split(/\s+/);
    const links: TeamLink[] = [];
    if (rp.homepage) links.push({ label: 'Homepage', url: rp.homepage });
    if (rp.acmDl) links.push({ label: 'ACM DL', url: rp.acmDl });
    if (rp.linkedin) links.push({ label: 'LinkedIn', url: rp.linkedin });
    for (const l of rp.links ?? []) if (!links.some((x) => x.url === l.url)) links.push(l);
    const p: TeamPerson = {
      id: rp.id,
      given: words.slice(0, -1).join(' '),
      family: words[words.length - 1] ?? rp.name,
      affiliations: rp.affiliations,
      expertise: rp.expertise,
      links,
      ...(rp.email ? { email: rp.email } : {}),
      ...(rp.mastheadAffiliation ? { mastheadAffiliation: rp.mastheadAffiliation } : {}),
      ...(rp.notes ? { notes: rp.notes } : {}),
      ...(rp.portrait ? { portrait: rp.portrait } : {}),
    };
    team.people.push(p);
    for (const role of rp.roles) {
      let m: RegExpExecArray | null;
      if (/deputy editor[- ]in[- ]chief/i.test(role)) team.leaders.push({ person: p.id, role: 'deputy-eic' });
      else if (/editor[- ]in[- ]chief/i.test(role)) team.leaders.push({ person: p.id, role: 'eic' });
      else if (/co-?chair/i.test(role)) team.leaders.push({ person: p.id, role: 'co-chair' });
      else if ((m = /^(.+?)\s+(?:column|section)\s+head$/i.exec(role))) {
        const name = m[1]!;
        let s = sectionOf.get(name);
        if (!s) {
          s = { id: newId('s', name, team.sections.map((x) => x.id)), name, heads: [], aes: [] };
          sectionOf.set(name, s);
          team.sections.push(s);
        }
        s.heads.push(p.id);
      } else if ((m = /^(.+?)\s+columnist$/i.exec(role))) {
        const name = m[1]!;
        let c = columnOf.get(name);
        if (!c) {
          c = { id: newId('c', name, team.columns.map((x) => x.id)), name, columnists: [] };
          columnOf.set(name, c);
          team.columns.push(c);
        }
        c.columnists.push(p.id);
      } else if (/associate editor/i.test(role)) p.ae = true;
    }
    if (rp.group === 'associate_editors') p.ae = true;
  }
  // A column named like a section sits in it.
  for (const c of team.columns) {
    const s = sectionOf.get(c.name);
    if (s) c.section = s.id;
  }
  team.updatedAt = r.exportedAt || team.updatedAt;
  return team;
}

/** Remove a person and every place they appear. */
export function removePerson(team: Team, id: string): Team {
  return {
    ...team,
    people: team.people.filter((p) => p.id !== id),
    leaders: team.leaders.filter((l) => l.person !== id),
    sections: team.sections.map((s) => ({ ...s, heads: s.heads.filter((x) => x !== id), aes: s.aes.filter((x) => x !== id) })),
    columns: team.columns.map((c) => ({ ...c, columnists: c.columnists.filter((x) => x !== id) })),
  };
}
