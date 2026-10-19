// Text helpers shared by the parsers. Everything the parsers compare goes
// through normalize() so that whitespace, non-breaking spaces, curly quotes
// and case changes in Manuscript Central's HTML don't break matching.

export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFKC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[  -​  　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Elements whose boundaries separate words. textContent runs adjacent cells
// together ("CACM-26-03-9002.R2Title"), which breaks ID and label matching.
const BREAKS = new Set([
  'ADDRESS', 'BLOCKQUOTE', 'BR', 'BUTTON', 'CAPTION', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FORM', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HR', 'LI', 'OL', 'OPTION', 'P', 'PRE', 'SECTION', 'SELECT', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD',
  'TR', 'UL', 'ASIDE', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'ARTICLE', 'IMG', 'INPUT', 'TEXTAREA',
]);

/** Normalized text of an element and its descendants, with a space at block and cell boundaries. */
export function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      parts.push(n.textContent ?? '');
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = (n as Element).tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
    const brk = BREAKS.has(tag);
    if (brk) parts.push(' ');
    n.childNodes.forEach(walk);
    if (brk) parts.push(' ');
  };
  walk(el);
  return normalize(parts.join(''));
}

/** Text that belongs to the element itself, excluding child elements. */
export function ownText(el: Element): string {
  let s = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) s += n.textContent ?? '';
  });
  return normalize(s);
}

/** Label text with trailing colons, asterisks and case removed. */
export function labelKey(s: string): string {
  return normalize(s).replace(/[*:]+$/g, '').replace(/^[*]+/, '').trim().toLowerCase();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

/** FNV-1a 32-bit hash, returned as 8 hex digits. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * A table row that only wraps a nested layout table, as opposed to a data
 * row whose cells happen to hold small tables (MC puts each Status bullet,
 * "Make Immediate Decision", in a table of its own).
 */
export function isLayoutRow(tr: Element): boolean {
  const nested = Array.from(tr.querySelectorAll('table'));
  if (!nested.length) return false;
  const outer = nested.filter((t) => !nested.some((o) => o !== t && o.contains(t)));
  const total = textOf(tr).length;
  const inner = outer.reduce((n, t) => n + textOf(t).length, 0);
  return total === 0 || inner >= total * 0.6;
}
