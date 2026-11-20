// MC's manuscript flags, named. Each journal sets up its own little flag
// icons (a boxed red X, a star, …) and MC shows them next to a manuscript's
// ID with no words, so they're hard to remember. The "Flag This Manuscript"
// panel on a details page lists every icon with its label; when we see it we
// learn the icon-to-label map (by the icon's file name, per journal) and keep
// it in local storage. On lists and details pages each known flag icon then
// gets its label beside it, in italic E-MC brown: "(flagged: 3 or more
// rejections)". Only MC's own flag labels are kept, never anything about a
// manuscript.
//
// Only flag icons count: an image whose address has "flag" in it. 0.0.78
// took any icon near the panel heading, so it learned MC's bullets, "req"
// marks and expanders as flags and labeled them with manuscript IDs, names
// and checklist text; such entries are never used and are dropped when the
// panel is read again.

import { EMC_COLOR } from './ui';
import { labelKey, textOf } from './text';

/** Icon file name to label, for one journal. */
export type FlagMap = Record<string, string>;

const NOTE = 'flag-label';
// Spacer and bullet images MC uses everywhere; never a flag.
const SPACER = /^(t|b|x|blank|spacer|pixel|clear|dot|bullet)\.(gif|png)$/i;

/** The icon's file name ("flag_red_x.gif"), the key we learn it by. */
export function iconKey(img: HTMLImageElement): string | null {
  const src = img.getAttribute('src') ?? '';
  const name = src.split(/[?#]/)[0]!.split('/').pop() ?? '';
  return name && /\.(gif|png|jpe?g|svg)$/i.test(name) && !SPACER.test(name) ? name.toLowerCase() : null;
}

/** Whether an image is one of MC's flag icons: "flag" in its address. */
export function isFlagIcon(img: HTMLImageElement): boolean {
  const src = (img.getAttribute('src') ?? '').split(/[?#]/)[0]!;
  return /flag/i.test(src) && iconKey(img) !== null;
}

const MS_ID = /\b[A-Z]{2,}-\d{2}-\d{2}-\d{3,}/;
const PERSON = /^[A-Z][\p{L}'’ .-]{1,30}, [A-Z][\p{L}'’ .-]{0,30}$/u;

/** A flag label worth showing: short, and not a manuscript ID or a person's "Family, Given". */
export function plausibleLabel(label: string): boolean {
  return label.length >= 2 && label.length <= 40 && !MS_ID.test(label) && !PERSON.test(label);
}

/** Keep only entries that could be flags (the stored map may hold 0.0.78's mistakes). */
export function cleanFlagMap(map: FlagMap): FlagMap {
  return Object.fromEntries(Object.entries(map).filter(([k, v]) => !SPACER.test(k) && plausibleLabel(v)));
}

/** The "Flag This Manuscript" panel, if the page has one. */
export function flagPanel(doc: Document): Element | null {
  const head = Array.from(doc.querySelectorAll('div,th,td,h2,h3,h4,span,b,a,p')).find(
    (e) => e.children.length <= 1 && /^flag this manuscript$/.test(labelKey(textOf(e))),
  );
  if (!head) return null;
  // The panel is the nearest ancestor that holds icons besides the heading's own.
  let box: Element | null = head.parentElement;
  for (let i = 0; box && i < 6; i++, box = box.parentElement) {
    const flags = Array.from(box.querySelectorAll<HTMLImageElement>('img')).filter((img) => !head.contains(img) && isFlagIcon(img));
    if (flags.length) return box.querySelectorAll('img').length <= 30 ? box : null;
  }
  return null;
}

/** Every icon in the panel with the words next to it. */
export function readFlagPanel(panel: Element): FlagMap {
  const out: FlagMap = {};
  for (const img of Array.from(panel.querySelectorAll<HTMLImageElement>('img'))) {
    const key = iconKey(img);
    if (!key || !isFlagIcon(img)) continue;
    // The words beside the icon, else its tooltip or alt text.
    const holder = img.closest('tr, li, label') ?? img.parentElement;
    const beside = holder && holder !== panel && holder.querySelectorAll('img').length === 1 ? textOf(holder).replace(/\s+/g, ' ').trim() : '';
    const label = [beside, img.title.trim(), img.alt.trim()].find((t) => t && !/^flag this manuscript$/i.test(t) && plausibleLabel(t));
    if (label) out[key] ??= label;
  }
  return out;
}

/** Put each known flag's label beside its icon. Returns how many were labeled. */
export function labelFlags(doc: Document, map: FlagMap, on: boolean): number {
  doc.querySelectorAll(`[data-electric-mc="${NOTE}"]`).forEach((e) => e.remove());
  if (!on || !Object.keys(map).length) return 0;
  const known = cleanFlagMap(map);
  const panel = flagPanel(doc);
  let n = 0;
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img'))) {
    const key = iconKey(img);
    const label = key && isFlagIcon(img) && known[key];
    if (!label || panel?.contains(img) || img.closest('[data-electric-mc]') || inVersionHistory(img)) continue;
    const span = doc.createElement('span');
    span.setAttribute('data-electric-mc', NOTE);
    span.style.cssText = `margin-left:3px;font-size:12px !important;line-height:normal !important;font-style:italic !important;font-weight:400 !important;color:${EMC_COLOR} !important;text-decoration:none !important`;
    span.textContent = `(flagged: ${label})`;
    span.title = `MC flag: ${label}. Electric MC learned this from the "Flag This Manuscript" panel.`;
    // After the link the icon is in, so the label isn't part of it.
    (img.closest('a') ?? img).insertAdjacentElement('afterend', span);
    n++;
  }
  return n;
}

/** Whether an element is inside MC's Version History box (no flag labels there). */
function inVersionHistory(el: Element): boolean {
  for (let box = el.parentElement, i = 0; box && i < 8; box = box.parentElement, i++) {
    if (/^version history\b/.test(labelKey(textOf(box).slice(0, 40)))) return true;
  }
  return false;
}
