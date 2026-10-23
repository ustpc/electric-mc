// AE workloads: MC's pull-down for assigning an Associate Editor lists each
// editor with the number of manuscripts they currently have, as in
// "Editor, Pat (3)". We read those counts whenever that pull-down is on the
// page, so the Opinions matrix can show them. Text-anchored: a <select> whose
// options mostly end in a count, near text that mentions an editor.

import { fold } from './roster';

export interface AeLoadEntry {
  /** The editor as MC writes them, usually "Last, First". */
  name: string;
  count: number;
}

export interface AeLoad {
  /** When the pull-down was read (ISO). */
  at: string;
  /** Journal key, "host/first-path-segment". */
  journal: string;
  entries: AeLoadEntry[];
}

// "Editor, Pat (3)", "Editor, Pat [3]", "Editor, Pat - 3", "Editor, Pat (3 assigned)".
const COUNTED = /^(.*?\S)\s*(?:\((\d+)(?:\s+[a-z ]+)?\)|\[(\d+)\]|[-–:]\s*(\d+)(?:\s+[a-z ]+)?)\s*$/i;
const PLACEHOLDER = /^(?:-+|select\b.*|choose\b.*|--.*--|please\b.*|none|)$/i;

/** One option's name and count, or null when it doesn't end in a count. */
export function parseOption(text: string): AeLoadEntry | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = COUNTED.exec(t);
  if (!m) return null;
  const count = Number(m[2] ?? m[3] ?? m[4]);
  return Number.isFinite(count) ? { name: m[1]!, count } : null;
}

/** Text around a select: its label, attributes and the table row it sits in. */
function contextOf(select: HTMLSelectElement): string {
  const bits = [select.name, select.id, select.getAttribute('aria-label') ?? ''];
  for (const l of Array.from(select.labels ?? [])) bits.push(l.textContent ?? '');
  const row = select.closest('tr');
  if (row) {
    bits.push(row.textContent ?? '');
    // The heading is often the row above ("Assign Associate Editor").
    const prev = row.previousElementSibling;
    if (prev) bits.push(prev.textContent ?? '');
  }
  let p: Element | null = select.parentElement;
  for (let i = 0; p && i < 3; i++, p = p.parentElement) {
    const own = Array.from(p.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
    bits.push(own);
  }
  // Without the select's own option text, which names people.
  const optionText = Array.from(select.options).map((o) => o.text);
  let s = bits.join(' ');
  for (const o of optionText) s = s.split(o).join(' ');
  return s;
}

const EDITOR = /\b(?:associate\s+editor|editor|AE)s?\b/i;
const REVIEWER = /\breviewers?\b/i;

/**
 * The AE pull-down's entries on this page, or null when there isn't one.
 * Most non-placeholder options must end in a count (at least two of them),
 * and the text around the select must mention an editor and not reviewers.
 */
export function readAeLoad(doc: Document): AeLoadEntry[] | null {
  for (const select of Array.from(doc.querySelectorAll('select'))) {
    const opts = Array.from(select.options).map((o) => o.text.replace(/\s+/g, ' ').trim()).filter((t) => !PLACEHOLDER.test(t));
    if (opts.length < 2) continue;
    const entries = opts.map(parseOption).filter((e): e is AeLoadEntry => !!e);
    if (entries.length < 2 || entries.length < opts.length * 0.6) continue;
    const ctx = contextOf(select);
    if (!EDITOR.test(ctx) || (REVIEWER.test(ctx) && !/associate\s+editor/i.test(ctx))) continue;
    return entries;
  }
  return null;
}

/** "host/first-path-segment" for an MC URL, so each journal keeps its own counts. */
export function journalKey(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return `${u.hostname}/${seg}`;
  } catch {
    return '';
  }
}

/** MC's "Last, First M." split into surname and given-name words, folded. */
export function nameParts(name: string): { surname: string[]; given: string[] } {
  const words = (s: string) => fold(s).replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  const comma = name.indexOf(',');
  if (comma >= 0) return { surname: words(name.slice(0, comma)), given: words(name.slice(comma + 1)) };
  const all = words(name);
  return { surname: all.slice(-1), given: all.slice(0, -1) };
}

/**
 * The roster person an MC name refers to, or undefined when none or more
 * than one fits. MC's surname must be how the roster name ends. Among those, the one whose first name matches MC's first given
 * name (or its initial) wins.
 */
export function matchPerson<P extends { id: string; name: string }>(mcName: string, people: P[]): P | undefined {
  const mc = nameParts(mcName);
  if (!mc.surname.length) return undefined;
  const bySurname = people.filter((p) => {
    const words = fold(p.name).replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
    const tail = words.slice(-mc.surname.length);
    return words.length > mc.surname.length && tail.join(' ') === mc.surname.join(' ');
  });
  const first = mc.given[0];
  const byGiven = first
    ? bySurname.filter((p) => {
        const f = fold(p.name).replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean)[0] ?? '';
        return f === first || (first.length === 1 && f.startsWith(first)) || (f.length === 1 && first.startsWith(f));
      })
    : bySurname;
  if (byGiven.length === 1) return byGiven[0];
  // A lone surname match with a different first name is usually a
  // nickname (Jim for James); several are ambiguous.
  return byGiven.length === 0 && bySurname.length === 1 ? bySurname[0] : undefined;
}
