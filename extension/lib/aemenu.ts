// The AE-assignment menu, regrouped and restyled. MC's Assign Associate
// Editor pull-down lists every editor in one alphabetical run. Here its
// options are moved into groups the person chooses (for the Opinions
// co-chair: column heads, then Opinions AEs, then everyone else), each group
// under a labeled divider (an <optgroup>), with the group's own color and
// weight. Option values, text and the selection are never changed, so MC
// submits exactly what it would have. Chrome 135+'s `appearance: base-select`
// lets the open menu show the fonts and colors; older Chrome still gets the
// order and the dividers. The config names no one unless the person types
// names in: groups normally draw on the roster they loaded (lib/roster.ts).
// Configs live in chrome.storage.local; a shared server copy is designed but
// not built (fetchServerAeMenu, pushServerAeMenu).

import { PLACEHOLDER, findAeSelect, matchPerson, nameParts, parseOption } from './aeload';
import { GROUPS, type GroupId, type Roster } from './roster';

export interface AeMenuStyle {
  /** A CSS color, such as "#7a3e00" or "darkred". */
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface AeMenuGroup extends AeMenuStyle {
  /** The divider's label, such as "Column heads". */
  label: string;
  /** Everyone in this section of the loaded roster. */
  rosterGroup?: GroupId;
  /** Editors named the way MC lists them ("Editor, Pat"); these win over roster sections. */
  names?: string[];
}

export interface AeMenuConfig {
  format: 'electric-mc-ae-menu';
  version: 1;
  /** Who the layout is for, such as "Opinions co-chair". */
  profile: string;
  enabled: boolean;
  /** Menu text size in px; 0 keeps MC's. */
  fontSize: number;
  /** A CSS font family; blank keeps MC's. */
  fontFamily: string;
  /** Order within each group: MC's own (alphabetical), by name, or fewest manuscripts first. */
  sort: 'mc' | 'name' | 'load';
  groups: AeMenuGroup[];
  /** Everyone no group claims, last. */
  rest: AeMenuStyle & { label: string };
}

/** Where the menu's config comes from, and the copies kept in this browser. */
export interface AeMenuStore {
  source: 'local' | 'server';
  local?: AeMenuConfig;
  /** The last copy fetched from the server. */
  server?: AeMenuConfig;
  serverFetchedAt?: string;
}

/** The Opinions co-chair's layout: column heads, Opinions AEs, then everyone else. */
export function defaultAeMenu(): AeMenuConfig {
  return {
    format: 'electric-mc-ae-menu',
    version: 1,
    profile: 'Opinions co-chair',
    enabled: true,
    fontSize: 0,
    fontFamily: '',
    sort: 'mc',
    groups: [
      { label: 'Column heads', rosterGroup: 'column_heads', color: '#7a3e00', bold: true, names: [] },
      { label: 'Opinions AEs', rosterGroup: 'associate_editors', color: '#1d4ed8', bold: false, names: [] },
    ],
    rest: { label: 'Other AEs', color: '#6b7280', italic: false },
  };
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

function label(v: unknown, at: string): string {
  if (typeof v !== 'string' || !v.trim() || v.length > 80) throw new Invalid(`${at}.label must be text (up to 80 characters)`);
  return v.trim();
}

/** A config from JSON, or an Error saying what's wrong with it. */
export function parseAeMenu(json: unknown): AeMenuConfig {
  const r = json as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || r.format !== 'electric-mc-ae-menu') throw new Invalid('This is not an Electric MC AE menu config ("format": "electric-mc-ae-menu").');
  if (r.version !== 1) throw new Invalid(`AE menu config version ${String(r.version)} is newer than this extension understands.`);
  const profile = typeof r.profile === 'string' ? r.profile.slice(0, 80) : '';
  if (r.enabled !== undefined && typeof r.enabled !== 'boolean') throw new Invalid('enabled must be true or false');
  const fontSize = r.fontSize === undefined ? 0 : Number(r.fontSize);
  if (!Number.isInteger(fontSize) || (fontSize !== 0 && (fontSize < 8 || fontSize > 30))) throw new Invalid('fontSize must be 0 (MC\'s own) or 8 to 30');
  const fontFamily = r.fontFamily === undefined ? '' : r.fontFamily;
  if (typeof fontFamily !== 'string' || !FONT.test(fontFamily)) throw new Invalid('fontFamily must be a plain font list, such as "Helvetica, Arial, sans-serif"');
  const sort = r.sort === undefined ? 'mc' : r.sort;
  if (sort !== 'mc' && sort !== 'name' && sort !== 'load') throw new Invalid('sort must be "mc", "name" or "load"');
  if (!Array.isArray(r.groups) || r.groups.length > 20) throw new Invalid('groups must be a list (up to 20)');
  const groups = r.groups.map((raw, i): AeMenuGroup => {
    const at = `groups[${i}]`;
    const g = raw as Record<string, unknown> | null;
    if (!g || typeof g !== 'object') throw new Invalid(`${at} must be an object`);
    const out: AeMenuGroup = { label: label(g.label, at), ...style(g, at) };
    if (g.rosterGroup !== undefined && g.rosterGroup !== null && g.rosterGroup !== '') {
      if (typeof g.rosterGroup !== 'string' || !GROUP_IDS.has(g.rosterGroup)) throw new Invalid(`${at}.rosterGroup must be one of ${[...GROUP_IDS].join(', ')}`);
      out.rosterGroup = g.rosterGroup as GroupId;
    }
    if (g.names !== undefined) {
      if (!Array.isArray(g.names) || g.names.length > 500 || g.names.some((n) => typeof n !== 'string' || n.length > 200)) throw new Invalid(`${at}.names must be a list of names`);
      out.names = (g.names as string[]).map((n) => n.trim()).filter(Boolean);
    }
    return out;
  });
  const rest = (r.rest ?? { label: 'Other AEs' }) as Record<string, unknown>;
  if (typeof rest !== 'object') throw new Invalid('rest must be an object');
  return {
    format: 'electric-mc-ae-menu',
    version: 1,
    profile,
    enabled: r.enabled !== false,
    fontSize,
    fontFamily: fontFamily.trim(),
    sort,
    groups,
    rest: { label: label(rest.label, 'rest'), ...style(rest, 'rest') },
  };
}

/** Whether two names written the way MC or a person might ("Editor, Pat", "Pat Editor") are the same editor. */
export function sameName(a: string, b: string): boolean {
  const x = nameParts(a);
  const y = nameParts(b);
  if (!x.surname.length || x.surname.join(' ') !== y.surname.join(' ')) return false;
  const f = x.given[0] ?? '';
  const g = y.given[0] ?? '';
  return !f || !g || f === g || (f.length === 1 && g.startsWith(f)) || (g.length === 1 && f.startsWith(g));
}

interface Item {
  option: HTMLOptionElement;
  name: string;
  count: number;
  mcIndex: number;
}

/** Which group (an index into config.groups, or -1 for the rest) each editor falls in. */
export function groupOf(mcName: string, config: AeMenuConfig, roster: Roster | null | undefined): number {
  const named = config.groups.findIndex((g) => g.names?.some((n) => sameName(n, mcName)));
  if (named >= 0) return named;
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

function keepSelection(select: HTMLSelectElement, change: () => void) {
  const chosen = select.selectedOptions[0] ?? null;
  const value = select.value;
  change();
  if (chosen) chosen.selected = true;
  else select.value = value;
}

/**
 * Regroup and restyle MC's AE pull-down on this page. Returns whether there
 * was one. Running it again with the same config changes nothing, so the
 * page's mutation observer doesn't loop. A select MC already divides into
 * its own optgroups is left alone.
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
    const text = option.text.replace(/\s+/g, ' ').trim();
    if (PLACEHOLDER.test(text) || !option.value) return void top.push(option);
    const parsed = parseOption(text);
    const item: Item = { option, name: parsed?.name ?? text, count: parsed?.count ?? 0, mcIndex };
    const g = groupOf(item.name, config, roster);
    (g < 0 ? rest : buckets[g]!).push(item);
  });
  const order = (list: Item[]) =>
    config.sort === 'name'
      ? list.sort((a, b) => a.name.localeCompare(b.name) || a.mcIndex - b.mcIndex)
      : config.sort === 'load'
        ? list.sort((a, b) => a.count - b.count || a.mcIndex - b.mcIndex)
        : list;
  const sections: Array<{ label: string; style: AeMenuStyle; items: Item[] }> = config.groups
    .map((g, i) => ({ label: g.label, style: g, items: order(buckets[i]!) }))
    .filter((s) => s.items.length);
  // With no group used, the menu keeps MC's single list (styled as the rest).
  if (sections.length && rest.length) sections.push({ label: config.rest.label, style: config.rest, items: order(rest) });
  const plain = !sections.length;

  const wanted = [...top, ...(plain ? order(rest) : sections.flatMap((s) => s.items)).map((i) => i.option)];
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
      restoreStyle(o);
      o.removeAttribute(INDEX);
    }
    restoreStyle(select);
    select.removeAttribute(MENU);
  }
}

/**
 * The shared config, from the notes server (Settings > Notes server). Not
 * built yet: the plan is a signed request like the notes' ones
 * (lib/notesClient.ts), answered with the config section co-chairs keep on
 * the server. See doc/planning/AE menu config.md.
 */
export async function fetchServerAeMenu(server: string): Promise<AeMenuConfig> {
  if (!server) throw new Error('Set a notes server in Settings first.');
  throw new Error("The notes server doesn't keep AE menu configs yet. Use this browser's config for now.");
}

/** Send this browser's config to the server, for people the server lets change it. Not built yet. */
export async function pushServerAeMenu(server: string, _config: AeMenuConfig): Promise<void> {
  if (!server) throw new Error('Set a notes server in Settings first.');
  throw new Error("The notes server doesn't keep AE menu configs yet, so there's nothing to send it to.");
}
