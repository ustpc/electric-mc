// Restyling MC's pages. MC lays everything out in a fixed-width column
// (about 850px) with 11px text, which wastes most of a modern screen. We can
// widen that column to the window, less half an inch on each side, and scale
// the text up.
//
// MC's classes and IDs aren't stable, so the column is found by layout: the
// element that is fixed narrower than the window and centered, or given a
// width in its markup, and holds the most text.

import { textOf } from './text';

const WIDE = 'data-emc-wide';
const FONT = 'data-emc-fs';
const STYLE_ID = 'emc-restyle-style';
/** MC's own body text size, which the font-size preference is relative to. */
export const MC_FONT_PX = 11;
export const FONT_CHOICES = [0, 12, 13, 14, 15, 16, 18] as const;

export interface RestyleOptions {
  fullWidth: boolean;
  /** Body text size in px; 0 keeps MC's own. */
  fontSize: number;
}

const CSS = `
html[${WIDE}] body { margin-left: 0 !important; margin-right: 0 !important; }
[${WIDE}="outer"] { width: calc(100vw - 1in) !important; max-width: none !important; min-width: 0 !important;
  margin-left: auto !important; margin-right: auto !important; box-sizing: border-box !important; }
[${WIDE}="inner"] { width: 100% !important; max-width: none !important; box-sizing: border-box !important; }
`;

export function applyRestyle(doc: Document, o: RestyleOptions): void {
  if (o.fullWidth) widen(doc);
  else unwiden(doc);
  scaleFonts(doc, o.fontSize);
}

export function clearRestyle(doc: Document): void {
  unwiden(doc);
  scaleFonts(doc, 0);
}

function widen(doc: Document) {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-electric-mc', 'restyle');
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  doc.documentElement.setAttribute(WIDE, '');
  if (doc.querySelector(`[${WIDE}="outer"]`)) return;
  const outer = findColumn(doc);
  if (!outer) return;
  const width = outer.getBoundingClientRect().width;
  outer.setAttribute(WIDE, 'outer');
  // Inner wrappers and tables pinned to the same width have to grow with it.
  for (const el of Array.from(outer.querySelectorAll<HTMLElement>('table, div, form, center'))) {
    const w = el.getBoundingClientRect().width;
    if (Math.abs(w - width) < 40 && isFixed(el)) el.setAttribute(WIDE, 'inner');
  }
}

function unwiden(doc: Document) {
  doc.getElementById(STYLE_ID)?.remove();
  doc.documentElement.removeAttribute(WIDE);
  doc.querySelectorAll(`[${WIDE}]`).forEach((e) => e.removeAttribute(WIDE));
}

/** The page's fixed-width main column, if it has one. */
export function findColumn(doc: Document): HTMLElement | null {
  const view = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0;
  if (!view || !doc.body) return null;
  // The candidate holding the most text wins. Raw textContent can't be the
  // yardstick: MC pages carry large scripts and hidden dialogs (session
  // timeout, cookie consent) that dwarf the visible page.
  let best: HTMLElement | null = null;
  let bestText = 0;
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('table, div, form, center'))) {
    const w = el.getBoundingClientRect().width;
    if (w < 600 || w > view - 100) continue;
    if (!isFixed(el) && !isCentered(el)) continue;
    if (best?.contains(el)) continue; // the outer one already counts this text
    if (doc.defaultView?.getComputedStyle(el).visibility === 'hidden') continue;
    const n = textOf(el).length;
    if (n > bestText) {
      best = el;
      bestText = n;
    }
  }
  return best;
}

function isFixed(el: HTMLElement): boolean {
  if (/^\d+(px)?$/.test(el.getAttribute('width') ?? '')) return true;
  if (/px$/.test(el.style.width) || /px$/.test(el.style.maxWidth)) return true;
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !!cs && (/px$/.test(cs.maxWidth) || /px$/.test(cs.minWidth) && parseFloat(cs.minWidth) >= 600);
}

function isCentered(el: HTMLElement): boolean {
  if (el.getAttribute('align') === 'center') return true;
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!cs) return false;
  const l = parseFloat(cs.marginLeft);
  const r = parseFloat(cs.marginRight);
  return l > 20 && Math.abs(l - r) < 2;
}

/**
 * Scale text so MC's 11px body text becomes `px`. Elements whose size differs
 * from their parent's set their own size; those get the scaled size inline,
 * and everything else inherits it. The original size is kept so scaling never
 * compounds and can be undone.
 */
function scaleFonts(doc: Document, px: number) {
  const view = doc.defaultView;
  if (!px || px === MC_FONT_PX) {
    doc.querySelectorAll<HTMLElement>(`[${FONT}]`).forEach((e) => {
      e.style.removeProperty('font-size');
      e.removeAttribute(FONT);
    });
    return;
  }
  if (!view || !doc.body) return;
  const ratio = px / MC_FONT_PX;
  const els = [doc.body, ...Array.from(doc.body.querySelectorAll<HTMLElement>('*'))];
  // Read every original size before writing any, so writes don't skew reads.
  const plan: Array<[HTMLElement, number]> = [];
  for (const el of els) {
    if (el.closest('[data-electric-mc]') || /^(SCRIPT|STYLE|NOSCRIPT|BR|IMG)$/.test(el.tagName)) continue;
    const saved = el.getAttribute(FONT);
    if (saved) {
      plan.push([el, Number(saved)]);
      continue;
    }
    const own = parseFloat(view.getComputedStyle(el).fontSize);
    if (!own) continue;
    // Same size as the parent means it inherits; it will follow the parent.
    const parent = el === doc.body || !el.parentElement ? NaN : parseFloat(view.getComputedStyle(el.parentElement).fontSize);
    if (own !== parent) plan.push([el, own]);
  }
  for (const [el, orig] of plan) {
    el.setAttribute(FONT, String(orig));
    el.style.setProperty('font-size', `${Math.round(orig * ratio * 10) / 10}px`, 'important');
  }
}
