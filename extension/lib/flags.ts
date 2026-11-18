// MC's manuscript flags, named. Each journal sets up its own little flag
// icons (a boxed red X, a star, …) and MC shows them next to a manuscript's
// ID with no words, so they're hard to remember. The "Flag This Manuscript"
// panel on a details page lists every icon with its label; when we see it we
// learn the icon-to-label map (by the icon's file name, per journal) and keep
// it in local storage. On lists and details pages each known flag icon then
// gets its label beside it, in italic E-MC brown: "(flagged: 3 or more
// rejections)". Only MC's own flag labels are kept, never anything about a
// manuscript.

import { EMC_COLOR } from './milestones';
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

/** The "Flag This Manuscript" panel, if the page has one. */
export function flagPanel(doc: Document): Element | null {
  const head = Array.from(doc.querySelectorAll('div,th,td,h2,h3,h4,span,b,a,p')).find(
    (e) => e.children.length <= 1 && /^flag this manuscript$/.test(labelKey(textOf(e))),
  );
  if (!head) return null;
  // The panel is the nearest ancestor that holds icons besides the heading's own.
  let box: Element | null = head.parentElement;
  for (let i = 0; box && i < 6; i++, box = box.parentElement) {
    if (Array.from(box.querySelectorAll('img')).filter((img) => !head.contains(img)).length >= 1) return box;
  }
  return null;
}

/** Every icon in the panel with the words next to it. */
export function readFlagPanel(panel: Element): FlagMap {
  const out: FlagMap = {};
  for (const img of Array.from(panel.querySelectorAll<HTMLImageElement>('img'))) {
    const key = iconKey(img);
    const holder = img.closest('tr, li, label') ?? img.parentElement;
    if (!key || !holder || holder === panel || holder.querySelectorAll('img').length !== 1) continue;
    const label = textOf(holder).replace(/\s+/g, ' ').trim();
    if (!label || label.length > 60 || /^flag this manuscript$/i.test(label)) continue;
    out[key] ??= label;
  }
  return out;
}

/** Put each known flag's label beside its icon. Returns how many were labeled. */
export function labelFlags(doc: Document, map: FlagMap, on: boolean): number {
  doc.querySelectorAll(`[data-electric-mc="${NOTE}"]`).forEach((e) => e.remove());
  if (!on || !Object.keys(map).length) return 0;
  const panel = flagPanel(doc);
  let n = 0;
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img'))) {
    const key = iconKey(img);
    const label = key && map[key];
    if (!label || panel?.contains(img) || img.closest('[data-electric-mc]')) continue;
    const span = doc.createElement('span');
    span.setAttribute('data-electric-mc', NOTE);
    span.style.cssText = `margin-left:3px;font-style:italic !important;font-weight:400 !important;color:${EMC_COLOR} !important`;
    span.textContent = `(flagged: ${label})`;
    span.title = `MC flag: ${label}. Electric MC learned this from the "Flag This Manuscript" panel.`;
    img.insertAdjacentElement('afterend', span);
    n++;
  }
  return n;
}
