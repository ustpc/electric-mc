// The AE-assignment menu, regrouped, relabeled and restyled. MC's Assign
// Associate Editor pull-down lists every editor in one alphabetical run as
// "Last, First (n)". A config moves the options into groups (for the
// Opinions co-chair: column heads, then Opinions AEs, then everyone else),
// each under a labeled divider (an <optgroup>) with its own color and
// weight, and can relabel the people in its table ("Research Pathways -
// Pat Editor (3)"). Option values and the selection never change, so MC
// submits exactly what it would have; MC's own text is kept on the option
// (lib/aeload.ts MC_TEXT) so workload counts still read correctly. Chrome
// 135+'s `appearance: base-select` lets the open menu show the styles.
// The shipped config (config/ae-menu.json) has an empty table: real tables
// are loaded from a local file and kept in chrome.storage.local. A shared
// store on the server is planned (doc/planning/AE menu config.md); its
// client calls below are stubs.

import blank from '../config/ae-menu.json';
import { MC_TEXT, PLACEHOLDER, findAeSelect, matchPerson, mcText, nameParts, parseOption } from './aeload';
import { GROUPS, type GroupId, type Roster } from './roster';

export interface AeMenuStyle {
  /** A CSS color, such as "#7a3e00" or "darkred". */
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

/** One row of the config's table. */
export interface AePerson {
  given: string;
  family: string;
  /** Column or role, such as "Privacy" or "Co-Chair". */
  section: string;
  email?: string;
}

export interface AeMenuGroup extends AeMenuStyle {
  /** The divider's label, such as "Column heads". */
  label: string;
  /** People in the config's table: true for all of them, or only these sections. */
  fromTable?: boolean | string[];
  /** Everyone in this section of the loaded roster. */
  rosterGroup?: GroupId;
  /** Editors named the way MC lists them ("Editor, Pat"); these win over everything else. */
  names?: string[];
}

export interface AeMenuConfig {
  format: 'electric-mc-ae-menu';
  version: 1;
  /** The config's name, such as "Opinions co-chair"; also its name on the server. */
  profile: string;
  enabled: boolean;
  /** Menu text size in px; 0 keeps MC's. */
  fontSize: number;
  /** A CSS font family; blank keeps MC's. */
  fontFamily: string;
  /** Order within each group: MC's own (alphabetical), by label, or fewest manuscripts first. */
  sort: 'mc' | 'name' | 'load';
  /**
   * How table people are shown, with {section}, {given}, {family} and {mc}
   * (MC's own name); MC's count is kept after it. Blank keeps MC's text.
   */
  label: string;
  people: AePerson[];
  groups: AeMenuGroup[];
  /** Everyone no group claims, last. */
  rest: AeMenuStyle & { label: string };
}

/** Where the menu's config comes from, and the copies kept in this browser. */
export interface AeMenuStore {
  source: 'local' | 'server';
  local?: AeMenuConfig;
  /** The server config last downloaded, and its name there. */
  server?: AeMenuConfig;
  serverName?: string;
  serverFetchedAt?: string;
}

/** The config shipped with the extension: the Opinions co-chair layout with an empty table. */
export function defaultAeMenu(): AeMenuConfig {
  return parseAeMenu(structuredClone(blank));
}

/** The config the menu uses now, or undefined when it's left alone. */
export function activeAeMenu(store: AeMenuStore | undefined): AeMenuConfig | undefined {
  const c = store?.source === 'server' ? store.server : store?.local;
  return c?.enabled ? c : undefined;
}

class Invalid extends Error {}

// Colors and fonts are set through element.style, which ignores anything that
// isn't valid CSS, but they are still kept short and plain.
const COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]{3,30}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;
const FONT = /^[\w\s,'"-]{0,200}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GROUP_IDS = new Set<string>(GROUPS.map((g) => g.id));

function style(v: Record<string, unknown>, at: string): AeMenuStyle {
  const out: AeMenuStyle = {};
  if (v.color !== undefined && v.color !== '' && v.color !== null) {
    if (typeof v.color !== 'string' || !COLOR.test(v.color)) throw new Invalid(`${at}.color must be a color such as "#7a3e00" or "darkred"`);
    out.color = v.color;
  }
  for (const k of ['bold', 'italic'] as const) {
    if (v[k] === undefined) continue;
    if (typeof v[k] !== 'boolean') throw new Invalid(`${at}.${k} must be true or false`);
    out[k] = v[k] as boolean;
  }
  return out;
}

function text(v: unknown, at: string, max: number, required = true): string {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' || v.length > max) throw new Invalid(`${at} must be text (up to ${max} characters)`);
  const t = v.trim();
  if (required && !t) throw new Invalid(`${at} can't be blank`);
  return t;
}

function strings(v: unknown, at: string, max = 500): string[] {
  if (!Array.isArray(v) || v.length > max || v.some((n) => typeof n !== 'string' || n.length > 200)) throw new Invalid(`${at} must be a list of text`);
  return (v as string[]).map((n) => n.trim()).filter(Boolean);
}

/** A config from JSON, or an Error saying what's wrong with it. */
export function parseAeMenu(json: unknown): AeMenuConfig {
  const r = json as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || r.format !== 'electric-mc-ae-menu') throw new Invalid('This is not an Electric MC AE menu config ("format": "electric-mc-ae-menu").');
  if (r.version !== 1) throw new Invalid(`AE menu config version ${String(r.version)} is newer than this extension understands.`);
  if (r.enabled !== undefined && typeof r.enabled !== 'boolean') throw new Invalid('enabled must be true or false');
  const fontSize = r.fontSize === undefined ? 0 : Number(r.fontSize);
  if (!Number.isInteger(fontSize) || (fontSize !== 0 && (fontSize < 8 || fontSize > 30))) throw new Invalid("fontSize must be 0 (MC's own) or 8 to 30");
  const fontFamily = r.fontFamily === undefined ? '' : r.fontFamily;
  if (typeof fontFamily !== 'string' || !FONT.test(fontFamily)) throw new Invalid('fontFamily must be a plain font list, such as "Helvetica, Arial, sans-serif"');
  const sort = r.sort === undefined ? 'mc' : r.sort;
  if (sort !== 'mc' && sort !== 'name' && sort !== 'load') throw new Invalid('sort must be "mc", "name" or "load"');
  const label = text(r.label, 'label', 120, false);
  const people = r.people === undefined ? [] : r.people;
  if (!Array.isArray(people) || people.length > 1000) throw new Invalid('people must be a list (up to 1000)');
  const table = people.map((raw, i): AePerson => {
    const at = `people[${i}]`;
    const p = raw as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') throw new Invalid(`${at} must be an object`);
    const out: AePerson = { given: text(p.given, `${at}.given`, 100), family: text(p.family, `${at}.family`, 100), section: text(p.section, `${at}.section`, 100, false) };
    const email = text(p.email, `${at}.email`, 200, false);
    if (email) {
      if (!EMAIL.test(email)) throw new Invalid(`${at}.email is not an email address`);
      out.email = email;
    }
    return out;
  });
  if (!Array.isArray(r.groups) || r.groups.length > 20) throw new Invalid('groups must be a list (up to 20)');
  const groups = r.groups.map((raw, i): AeMenuGroup => {
    const at = `groups[${i}]`;
    const g = raw as Record<string, unknown> | null;
    if (!g || typeof g !== 'object') throw new Invalid(`${at} must be an object`);
    const out: AeMenuGroup = { label: text(g.label, `${at}.label`, 80), ...style(g, at) };
    if (g.fromTable !== undefined && g.fromTable !== false) out.fromTable = g.fromTable === true ? true : strings(g.fromTable, `${at}.fromTable`, 100);
    if (g.rosterGroup !== undefined && g.rosterGroup !== null && g.rosterGroup !== '') {
      if (typeof g.rosterGroup !== 'string' || !GROUP_IDS.has(g.rosterGroup)) throw new Invalid(`${at}.rosterGroup must be one of ${[...GROUP_IDS].join(', ')}`);
      out.rosterGroup = g.rosterGroup as GroupId;
    }
    if (g.names !== undefined) out.names = strings(g.names, `${at}.names`);
    return out;
  });
  const rest = (r.rest ?? { label: 'Other AEs' }) as Record<string, unknown>;
  if (typeof rest !== 'object') throw new Invalid('rest must be an object');
  return {
    format: 'electric-mc-ae-menu',
    version: 1,
    profile: text(r.profile, 'profile', 80, false),
    enabled: r.enabled !== false,
    fontSize,
    fontFamily: fontFamily.trim(),
    sort,
    label,
    people: table,
    groups,
    rest: { label: text(rest.label, 'rest.label', 80), ...style(rest, 'rest') },
  };
}

/**
 * Table rows from pasted text: one person per line, tab- or comma-separated
 * given name, family name, section and email, as copied from a spreadsheet.
 * A header row (mentioning "name") is skipped.
 */
export function parsePeopleTable(pasted: string): AePerson[] {
  const out: AePerson[] = [];
  for (const line of pasted.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim());
    if (/\bname\b/i.test(cells[0] ?? '') || /\bname\b/i.test(cells[1] ?? '')) continue;
    const [given = '', family = '', section = '', email = ''] = cells;
    if (!given || !family) continue;
    out.push(email ? { given, family, section, email } : { given, family, section });
  }
  return out;
}

/**
 * Whether two names written the way MC or a person might ("Editor, Pat",
 * "Pat Editor") are the same editor. Family names must agree; given names
 * agree when any word of one matches a word of the other or its initial
 * ("Editor, R. Pat" and "Pat Editor"). Nicknames are never guessed.
 */
export function sameName(a: string, b: string): boolean {
  let x = nameParts(a);
  let y = nameParts(b);
  // "Robin Van Reviewer" has no comma to say where the family name starts:
  // take as many final words as the other name's family name has.
  const split = (n: string, len: number) => {
    const all = [...nameParts(n).given, ...nameParts(n).surname];
    return { surname: all.slice(-len), given: all.slice(0, -len) };
  };
  if (!a.includes(',') && b.includes(',')) x = split(a, y.surname.length);
  else if (a.includes(',') && !b.includes(',')) y = split(b, x.surname.length);
  if (!x.surname.length || x.surname.join(' ') !== y.surname.join(' ')) return false;
  if (!x.given.length || !y.given.length) return true;
  const fits = (f: string, g: string) => f === g || (f.length === 1 && g.startsWith(f)) || (g.length === 1 && f.startsWith(g));
  return x.given.some((f) => y.given.some((g) => fits(f, g)));
}

/** The table row for an editor MC names, if there is exactly one. */
export function personFor(mcName: string, people: AePerson[]): AePerson | undefined {
  const hits = people.filter((p) => sameName(`${p.family}, ${p.given}`, mcName));
  return hits.length === 1 ? hits[0] : undefined;
}

/** How a table person is shown: the config's label with its fields filled in. */
export function labelFor(p: AePerson, mcName: string, template: string): string {
  const fields: Record<string, string> = { section: p.section, given: p.given, family: p.family, mc: mcName };
  const out = template.replace(/\{(\w+)\}/g, (m, k: string) => fields[k] ?? m).replace(/\s+/g, ' ').trim();
  // A blank section leaves a dangling separator ("- Pat Editor").
  return out.replace(/^[-–:,|·]\s*/, '').replace(/\s*[-–:,|·]$/, '');
}

/** Which group (an index into config.groups, or -1 for the rest) an editor falls in. */
export function groupOf(mcName: string, config: AeMenuConfig, roster: Roster | null | undefined): number {
  const named = config.groups.findIndex((g) => g.names?.some((n) => sameName(n, mcName)));
  if (named >= 0) return named;
  const row = personFor(mcName, config.people);
  if (row) {
    const t = config.groups.findIndex((g) => g.fromTable === true || (Array.isArray(g.fromTable) && g.fromTable.some((s) => s.toLowerCase() === row.section.toLowerCase())));
    if (t >= 0) return t;
  }
  const person = roster ? matchPerson(mcName, roster.people) : undefined;
  return person ? config.groups.findIndex((g) => g.rosterGroup === person.group) : -1;
}

/** How many of these editors each group gets (the last number is the rest), for the settings preview. */
export function groupCounts(names: string[], config: AeMenuConfig, roster: Roster | null | undefined): number[] {
  const out = new Array<number>(config.groups.length + 1).fill(0);
  for (const n of names) {
    const g = groupOf(n, config, roster);
    out[g < 0 ? config.groups.length : g]!++;
  }
  return out;
}

/** Table people MC's pull-down didn't list, so a typo or a missing account shows. */
export function unmatchedPeople(names: string[], people: AePerson[]): AePerson[] {
  return people.filter((p) => !names.some((n) => sameName(`${p.family}, ${p.given}`, n)));
}

interface Item {
  option: HTMLOptionElement;
  name: string;
  count: number;
  mcIndex: number;
  /** The text to show, or MC's own. */
  shown: string;
}

const MENU = 'data-emc-aemenu';
const GROUP = 'data-emc-group';
const INDEX = 'data-emc-i';
const STYLE0 = 'data-emc-style0';
const STYLE_ID = 'emc-aemenu-style';

const CSS = `
select[${MENU}], select[${MENU}]::picker(select) { appearance: base-select; }
select[${MENU}]::picker(select) { max-height: min(75vh, 48em); overflow-y: auto; border: 1px solid #9ca3af; border-radius: 4px; padding: 2px 0; }
select[${MENU}] optgroup[${GROUP}] { font-weight: 700; font-style: normal; color: #4b5563; border-top: 1px solid #d1d5db; margin-top: 3px; padding-top: 2px; }
select[${MENU}] optgroup[${GROUP}]:first-of-type { border-top: 0; margin-top: 0; }
select[${MENU}] option { padding: 1px 10px; }
`;

/** Style an element, remembering its own style attribute the first time. */
function setStyle(el: HTMLElement, s: AeMenuStyle & { fontSize?: number; fontFamily?: string }) {
  if (!el.hasAttribute(STYLE0)) el.setAttribute(STYLE0, el.getAttribute('style') ?? '');
  const base = el.getAttribute(STYLE0)!;
  if (el.getAttribute('style') !== base) el.setAttribute('style', base);
  if (s.color) el.style.color = s.color;
  if (s.bold !== undefined) el.style.fontWeight = s.bold ? '700' : '400';
  if (s.italic !== undefined) el.style.fontStyle = s.italic ? 'italic' : 'normal';
  if (s.fontSize) el.style.fontSize = `${s.fontSize}px`;
  if (s.fontFamily) el.style.fontFamily = s.fontFamily;
}

function restoreStyle(el: Element) {
  if (!el.hasAttribute(STYLE0)) return;
  const base = el.getAttribute(STYLE0)!;
  if (base) el.setAttribute('style', base);
  else el.removeAttribute('style');
  el.removeAttribute(STYLE0);
}

/** Show this text on an option, keeping MC's own the first time. Only writes when it differs. */
function setText(o: HTMLOptionElement, shown: string) {
  const mc = o.getAttribute(MC_TEXT);
  if (shown === (mc ?? o.text)) {
    if (mc !== null) {
      o.text = mc;
      o.removeAttribute(MC_TEXT);
    }
    return;
  }
  if (mc === null) o.setAttribute(MC_TEXT, o.text);
  if (o.text !== shown) o.text = shown;
}

function keepSelection(select: HTMLSelectElement, change: () => void) {
  const chosen = select.selectedOptions[0] ?? null;
  const value = select.value;
  change();
  if (chosen) chosen.selected = true;
  else select.value = value;
}

/**
 * Regroup, relabel and restyle MC's AE pull-down on this page. Returns
 * whether there was one. Running it again with the same config changes
 * nothing, so the page's mutation observer doesn't loop. A select MC
 * already divides into its own optgroups is left alone.
 */
export function applyAeMenu(doc: Document, config: AeMenuConfig, roster: Roster | null | undefined): boolean {
  const found = findAeSelect(doc);
  if (!found) return false;
  const { select } = found;
  if (!select.hasAttribute(MENU) && select.querySelector('optgroup')) return false;
  if (!doc.getElementById(STYLE_ID)) {
    const s = doc.createElement('style');
    s.id = STYLE_ID;
    s.setAttribute('data-electric-mc', 'ae-menu');
    s.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(s);
  }
  if (!select.hasAttribute(MENU)) Array.from(select.options).forEach((o, i) => o.setAttribute(INDEX, String(i)));
  select.setAttribute(MENU, '');
  setStyle(select, { fontSize: config.fontSize, fontFamily: config.fontFamily });

  const options = Array.from(select.options).sort((a, b) => Number(a.getAttribute(INDEX)) - Number(b.getAttribute(INDEX)));
  const top: HTMLOptionElement[] = [];
  const buckets: Item[][] = config.groups.map(() => []);
  const rest: Item[] = [];
  options.forEach((option, mcIndex) => {
    const mc = mcText(option);
    if (PLACEHOLDER.test(mc) || !option.value) return void top.push(option);
    const parsed = parseOption(mc);
    const name = parsed?.name ?? mc;
    const row = config.label ? personFor(name, config.people) : undefined;
    // MC's count ("(3)") stays after the new label.
    const shown = row ? `${labelFor(row, name, config.label)}${mc.slice(name.length)}` : mc;
    const item: Item = { option, name, count: parsed?.count ?? 0, mcIndex, shown };
    const g = groupOf(name, config, roster);
    (g < 0 ? rest : buckets[g]!).push(item);
  });
  const order = (list: Item[]) =>
    config.sort === 'name'
      ? list.sort((a, b) => a.shown.localeCompare(b.shown) || a.mcIndex - b.mcIndex)
      : config.sort === 'load'
        ? list.sort((a, b) => a.count - b.count || a.mcIndex - b.mcIndex)
        : list;
  const sections: Array<{ label: string; style: AeMenuStyle; items: Item[] }> = config.groups
    .map((g, i) => ({ label: g.label, style: g, items: order(buckets[i]!) }))
    .filter((s) => s.items.length);
  // With no group used, the menu keeps MC's single list (styled as the rest).
  if (sections.length && rest.length) sections.push({ label: config.rest.label, style: config.rest, items: order(rest) });
  const plain = !sections.length;
  const all = plain ? order(rest) : sections.flatMap((s) => s.items);

  const wanted = [...top, ...all.map((i) => i.option)];
  const groupsNow = Array.from(select.querySelectorAll(`optgroup[${GROUP}]`)).map((g) => `${g.getAttribute('label')}:${g.children.length}`);
  const groupsWanted = plain ? [] : sections.map((s) => `${s.label}:${s.items.length}`);
  const same = wanted.length === select.options.length && wanted.every((o, i) => select.options[i] === o) && groupsNow.join('|') === groupsWanted.join('|');
  if (!same) {
    keepSelection(select, () => {
      for (const o of top) select.appendChild(o);
      if (plain) for (const i of rest) select.appendChild(i.option);
      for (const s of sections) {
        const og = doc.createElement('optgroup');
        og.setAttribute(GROUP, '');
        og.label = s.label;
        for (const i of s.items) og.appendChild(i.option);
        select.appendChild(og);
      }
      select.querySelectorAll(`optgroup[${GROUP}]`).forEach((g) => {
        if (!g.children.length) g.remove();
      });
    });
  }
  for (const i of all) setText(i.option, i.shown);
  for (const s of sections) for (const i of s.items) setStyle(i.option, s.style);
  if (plain) for (const i of rest) setStyle(i.option, config.rest);
  return true;
}

/** Put MC's AE pull-down back as MC drew it. */
export function clearAeMenu(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove();
  for (const select of Array.from(doc.querySelectorAll<HTMLSelectElement>(`select[${MENU}]`))) {
    const options = Array.from(select.options).sort((a, b) => Number(a.getAttribute(INDEX)) - Number(b.getAttribute(INDEX)));
    keepSelection(select, () => {
      for (const o of options) select.appendChild(o);
      select.querySelectorAll(`optgroup[${GROUP}]`).forEach((g) => g.remove());
    });
    for (const o of options) {
      const mc = o.getAttribute(MC_TEXT);
      if (mc !== null) o.text = mc;
      o.removeAttribute(MC_TEXT);
      restoreStyle(o);
      o.removeAttribute(INDEX);
    }
    restoreStyle(select);
    select.removeAttribute(MENU);
  }
}

// ---- The shared store on the server (planned; doc/planning/AE menu config.md) ----

/** One config saved on the server, as its list shows it. */
export interface ServerConfigInfo {
  name: string;
  savedAt: string;
  savedBy: string;
  people: number;
}

const NOT_YET = "The server doesn't store AE menu configs yet. Save and load files for now.";
const needServer = (server: string) => {
  if (!server) throw new Error('Set a notes server in Settings first.');
};

/** The configs saved on the server. Anyone with a registered key may list them. */
export async function listServerConfigs(server: string): Promise<ServerConfigInfo[]> {
  needServer(server);
  throw new Error(NOT_YET);
}

/** Download one saved config. */
export async function getServerConfig(server: string, _name: string): Promise<AeMenuConfig> {
  needServer(server);
  throw new Error(NOT_YET);
}

/** Save a config under its profile name; the server accepts it only signed by the admin's key. */
export async function saveServerConfig(server: string, _config: AeMenuConfig): Promise<void> {
  needServer(server);
  throw new Error(NOT_YET);
}

/** Delete a saved config; admin only, like saving. */
export async function deleteServerConfig(server: string, _name: string): Promise<void> {
  needServer(server);
  throw new Error(NOT_YET);
}
