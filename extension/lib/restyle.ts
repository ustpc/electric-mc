// Restyling MC's pages. MC lays everything out in a fixed-width column
// (about 850px) with 11px text, which wastes most of a modern screen. We can
// widen that column to the window, less half an inch on each side, and scale
// the text up.
//
// MC's classes and IDs aren't stable, so the column is found by layout: the
// element that is fixed narrower than the window and centered, or given a
// width in its markup, and holds the most text.

import { findManuscriptIds } from './ids';
import { textOf } from './text';
import { EMC_COLOR } from './milestones';

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
    // The Version History box sizes its own text (emphasizeVersionHistory).
    if (el.hasAttribute(VH)) continue;
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

const HIDE = 'data-emc-hide';
const HIDE_ON = 'data-emc-hide-headers';
const HIDE_STYLE_ID = 'emc-hide-style';

/**
 * MC's page title on the left ("Search Results", "View Manuscripts"), an
 * image on some pages and plain text on others, and the empty column under
 * it that pushes the table right. Marked always; the html attribute switches
 * the setting, so it applies at once. When on, the left column goes and the
 * title is shown instead as a heading at the top of the page's main content.
 */
export function hidePageHeader(doc: Document, on: boolean): void {
  if (!doc.getElementById(HIDE_STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = HIDE_STYLE_ID;
    style.setAttribute('data-electric-mc', 'hide');
    style.textContent = `html[${HIDE_ON}] [${HIDE}] { display: none !important; }`;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img[src*="/page_headers/"]'))) {
    const cell = img.closest('td');
    if (!cell) continue;
    const row = cell.parentElement as HTMLTableRowElement | null;
    // The whole row goes when the image is all it holds.
    const rest = row ? Array.from(row.cells).filter((c) => c !== cell) : [];
    (row && rest.every((c) => !textOf(c) && !c.querySelector('img, input, select, a')) ? row : cell).setAttribute(HIDE, 'header');
  }
  // The empty spacer cell beside the page's content cell.
  for (const td of Array.from(doc.querySelectorAll<HTMLTableCellElement>('td[width$="%"]'))) {
    const next = td.nextElementSibling as HTMLTableCellElement | null;
    if (!next || next.tagName !== 'TD' || td.hasAttribute(HIDE)) continue;
    if (td.querySelector('img, input, select, a, table')) continue;
    // Empty, or holding only a short title such as "View Manuscripts".
    const title = textOf(td);
    if (title.length > 40) continue;
    if (parseFloat(td.getAttribute('width')!) > 30 || !/%$/.test(next.getAttribute('width') ?? '')) continue;
    if (textOf(next).length < 200) continue;
    td.setAttribute(HIDE, title ? 'header' : 'spacer');
    next.setAttribute(CONTENT, '');
  }
  if (on) doc.documentElement.setAttribute(HIDE_ON, '');
  else doc.documentElement.removeAttribute(HIDE_ON);
  moveTitle(doc, on);
}

const CONTENT = 'data-emc-content';
const TITLE_ATTR = 'page-title';

/** MC's abbreviations in header image names. */
const WORDS: Record<string, string> = { mss: 'Manuscripts', ms: 'Manuscript' };

/** "search_results_header.gif" -> "Search Results", "view_mss_header.gif" -> "View Manuscripts". */
export function headerImageTitle(img: HTMLImageElement): string {
  const alt = (img.getAttribute('alt') ?? '').trim();
  if (alt) return alt;
  const file = (img.getAttribute('src') ?? '').split(/[/?#]/).filter(Boolean).find((p) => /\.(gif|png|jpe?g|svg)$/i.test(p)) ?? '';
  return file
    .replace(/\.[a-z]+$/i, '')
    .replace(/[_-]?header$/i, '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => WORDS[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The page title MC shows on the left, as text. */
export function pageTitle(doc: Document): string {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[${HIDE}="header"]`))) {
    const img = el.querySelector<HTMLImageElement>('img[src*="/page_headers/"]');
    const t = img ? headerImageTitle(img) : textOf(el);
    if (t) return t;
  }
  return '';
}

/** Show the title as a heading on top of the main content, or take it away. */
function moveTitle(doc: Document, on: boolean): void {
  const existing = doc.querySelector(`[data-electric-mc="${TITLE_ATTR}"]`);
  const title = on ? pageTitle(doc) : '';
  if (!title) {
    existing?.remove();
    return;
  }
  if (existing?.textContent === title) return;
  existing?.remove();
  const h = doc.createElement('div');
  h.setAttribute('data-electric-mc', TITLE_ATTR);
  h.textContent = title;
  h.style.cssText = `font-weight:bold;color:${EMC_COLOR};font-size:1.5em;margin:0.2em 0 0.4em;`;
  const content = doc.querySelector<HTMLElement>(`[${CONTENT}]`);
  if (content) {
    content.prepend(h);
    return;
  }
  // No content cell beside it: put the heading where the title row was.
  const header = doc.querySelector<HTMLElement>(`[${HIDE}="header"]`);
  const table = header?.closest('table');
  if (table?.parentNode) table.parentNode.insertBefore(h, table);
  else doc.body?.prepend(h);
}

/** MC's previous/next document arrows ("7 / 8"), e.g. /images/en_US/icons/next_mss.gif. */
const NAV_ARROWS = ['img[src*="next_mss"]', 'img[src*="prev_mss"]', 'img[src*="previous_mss"]', 'img[alt="Next Document"]', 'img[alt="Previous Document"]', 'img[data-emc-src]'].join(', ');
const ORIGINAL = 'data-emc-src';

/** A crisp arrow in a round E-MC brown button, drawn as SVG. */
export function arrowImage(dir: 'next' | 'prev'): string {
  const tip = dir === 'next' ? 'M12 8.5 L23.5 16 L12 23.5 Z' : 'M20 8.5 L8.5 16 L20 23.5 Z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="${EMC_COLOR}"/><path d="${tip}" fill="#fff"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Redraw MC's previous/next document arrows twice as big, as sharp vector
 * arrows (scaling MC's small GIFs made them blurry); off puts MC's back.
 */
export function enlargeNavArrows(doc: Document, on: boolean): void {
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>(NAV_ARROWS))) {
    const original = img.getAttribute(ORIGINAL);
    if (!on) {
      if (original === null) continue;
      img.setAttribute('src', original);
      img.removeAttribute(ORIGINAL);
      img.style.removeProperty('width');
      img.style.removeProperty('height');
      continue;
    }
    if (original !== null) continue;
    const src = img.getAttribute('src') ?? '';
    const size = 2 * (img.naturalWidth || img.width || 16);
    img.setAttribute(ORIGINAL, src);
    img.setAttribute('src', arrowImage(/prev/i.test(`${src} ${img.alt}`) ? 'prev' : 'next'));
    img.style.setProperty('width', `${size}px`);
    img.style.setProperty('height', `${size}px`);
  }
}

const VH = 'data-emc-vh';
const VH_HEAD = 'data-emc-vh-head';
const POINT_PX = 4 / 3;

/**
 * The Version History box on a revision's page: its heading and the smallest
 * box around it that holds a manuscript ID. MC draws it small, in the side
 * column, though its "View Review Details" links are how editors see the
 * earlier reviews.
 */
export function findVersionHistory(doc: Document, idPattern?: string): { box: HTMLElement; heading: HTMLElement } | null {
  if (!doc.body) return null;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!/^\s*version history\s*$/i.test(n.textContent ?? '')) continue;
    const heading = n.parentElement;
    if (!heading || heading.closest('[data-electric-mc]')) continue;
    let box: HTMLElement | null = heading;
    for (let i = 0; box && i < 6; i++, box = box.parentElement) {
      const text = textOf(box);
      if (text.length > 3000) break;
      if (findManuscriptIds(text, idPattern).length) return { box, heading };
    }
  }
  return null;
}

/**
 * Make the Version History box easier to see: its heading bold and every
 * line in it one point larger than the rest of the page's text (after the
 * text-size preference). Each element keeps its MC size so this never
 * compounds; scaleFonts leaves these elements alone.
 */
export function emphasizeVersionHistory(doc: Document, on: boolean, fontSize = 0, idPattern?: string): void {
  if (!on) {
    doc.querySelectorAll<HTMLElement>(`[${VH}]`).forEach((el) => {
      el.style.removeProperty('font-size');
      el.removeAttribute(VH);
    });
    doc.querySelectorAll<HTMLElement>(`[${VH_HEAD}]`).forEach((el) => {
      el.style.removeProperty('font-weight');
      el.removeAttribute(VH_HEAD);
    });
    return;
  }
  const found = findVersionHistory(doc, idPattern);
  const view = doc.defaultView;
  if (!found || !view) return;
  const ratio = fontSize && fontSize !== MC_FONT_PX ? fontSize / MC_FONT_PX : 1;
  const els = [found.box, ...Array.from(found.box.querySelectorAll<HTMLElement>('*'))].filter((el) => !/^(SCRIPT|STYLE|NOSCRIPT|BR|IMG)$/.test(el.tagName) && !el.closest('[data-electric-mc]'));
  // Read every MC size before writing any.
  const plan: Array<[HTMLElement, number]> = [];
  for (const el of els) {
    const mine = el.getAttribute(VH);
    if (mine) {
      plan.push([el, Number(mine)]);
      continue;
    }
    const saved = el.getAttribute(FONT);
    const own = parseFloat(view.getComputedStyle(el).fontSize);
    const parent = el.parentElement;
    // Drawn later inside a box already enlarged: it inherits the parent's MC size.
    if (!saved && parent?.hasAttribute(VH) && own === parseFloat(view.getComputedStyle(parent).fontSize)) plan.push([el, Number(parent.getAttribute(VH))]);
    else if (saved) plan.push([el, Number(saved)]);
    else if (own) plan.push([el, own / ratio]);
  }
  for (const [el, orig] of plan) {
    el.removeAttribute(FONT);
    el.setAttribute(VH, String(Math.round(orig * 100) / 100));
    el.style.setProperty('font-size', `${Math.round((orig * ratio + POINT_PX) * 10) / 10}px`, 'important');
  }
  found.heading.setAttribute(VH_HEAD, '');
  found.heading.style.setProperty('font-weight', 'bold', 'important');
}

const PAGER_ORIGINAL = 'data-emc-pager-src';
const PAGER_TEXT = 'data-emc-pager';
const PAGE_RANGE = /\bmanuscripts\b.*\d+\s*[-–]\s*\d+.*\bof\s+\d+/i;

/** A plain arrowhead in E-MC brown, drawn as SVG. */
export function pagerImage(dir: 'next' | 'prev'): string {
  const tip = dir === 'next' ? 'M5 3 L13 8 L5 13 Z' : 'M11 3 L3 8 L11 13 Z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="${tip}" fill="${EMC_COLOR}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** What enlargePagerArrows found, for the developer log (shapes only, no page text). */
export interface PagerReport {
  holders: number;
  arrows: number;
  /** Each arrow's shape, such as "a>img" or "a>i.fa.fa-caret-left". */
  shapes: string[];
}

const PAGER_ICON = 'data-emc-pager-icon';
const MC_PAGER_GIF = /\/icons\/(left|right)_arrow\.gif(\?|$)/i;
const PAGER_HIDDEN = 'data-emc-pager-hid';

function shapeOf(el: Element): string {
  const one = (e: Element) => `${e.tagName.toLowerCase()}${Array.from(e.classList).slice(0, 3).map((c) => `.${c}`).join('')}`;
  const kid = el.firstElementChild;
  return kid ? `${one(el)}>${one(kid)}` : one(el);
}

/**
 * The grids' page arrows beside "Manuscripts 11-12 of 12", redrawn twice as
 * big: images become sharp brown arrowheads, text arrows (◂ ▸) get bigger
 * type, and icon-font or CSS-drawn arrows get our arrowhead drawn in their
 * place. The arrows may sit in the same cell as the range or in the next one.
 * Off puts MC's back.
 */
export function enlargePagerArrows(doc: Document, on: boolean): PagerReport {
  const report: PagerReport = { holders: 0, arrows: 0, shapes: [] };
  if (!on) {
    doc.querySelectorAll<HTMLImageElement>(`[${PAGER_ORIGINAL}]`).forEach((img) => {
      img.setAttribute('src', img.getAttribute(PAGER_ORIGINAL)!);
      img.removeAttribute(PAGER_ORIGINAL);
      img.style.removeProperty('width');
      img.style.removeProperty('height');
    });
    doc.querySelectorAll<HTMLElement>(`[${PAGER_TEXT}]`).forEach((el) => {
      el.style.removeProperty('font-size');
      el.removeAttribute(PAGER_TEXT);
    });
    doc.querySelectorAll<HTMLElement>(`[${PAGER_ICON}]`).forEach((el) => {
      el.querySelectorAll('[data-electric-mc="pager"]').forEach((n) => n.remove());
      el.querySelectorAll<HTMLElement>(`[${PAGER_HIDDEN}]`).forEach((n) => {
        n.style.removeProperty('display');
        n.removeAttribute(PAGER_HIDDEN);
      });
      el.style.removeProperty('background-image');
      el.removeAttribute(PAGER_ICON);
    });
    return report;
  }
  // The smallest elements whose text is the page range.
  const holders = Array.from(doc.querySelectorAll<HTMLElement>('td, th, div, span')).filter(
    (el) => PAGE_RANGE.test(textOf(el)) && textOf(el).length < 80 && !Array.from(el.children).some((c) => PAGE_RANGE.test(textOf(c))),
  );
  report.holders = holders.length;
  const ARROWS = 'a, [onclick], input[type=image], button';
  const found: Array<[HTMLElement, number]> = [];
  for (const holder of holders) {
    let links = Array.from(holder.querySelectorAll<HTMLElement>(ARROWS));
    // No arrows in the range's own cell: look in the rest of its row.
    if (!links.length && holder.parentElement) links = Array.from(holder.parentElement.querySelectorAll<HTMLElement>(ARROWS)).filter((l) => !l.contains(holder));
    links = links.filter((l) => !l.closest('select') && !links.some((o) => o !== l && o.contains(l)));
    links.forEach((l, i) => found.push([l, i]));
  }
  // MC's own pager arrows (icons/left_arrow.gif, right_arrow.gif), wherever
  // the range text is: on some lists it is spread over several cells.
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img'))) {
    const src = img.getAttribute(PAGER_ORIGINAL) ?? img.getAttribute('src') ?? '';
    if (!MC_PAGER_GIF.test(src) || found.some(([l]) => l === img || l.contains(img))) continue;
    const link = img.closest<HTMLElement>(ARROWS) ?? img;
    found.push([link, /left/i.test(src) ? 0 : 1]);
  }
  {
    found.forEach(([link, i]) => {
      if (link.closest('[data-electric-mc]')) return;
      const img = link.matches('img, input[type=image]') ? (link as HTMLImageElement) : link.querySelector<HTMLImageElement>('img:not([data-electric-mc])');
      const icon = link.querySelector('i, span[class], svg');
      const name = `${img?.getAttribute(PAGER_ORIGINAL) ?? img?.getAttribute('src') ?? ''} ${img?.getAttribute('alt') ?? ''} ${link.title} ${link.className} ${icon?.getAttribute('class') ?? ''} ${textOf(link)}`;
      const dir = /prev|left|back|◀|◂|‹|«/i.test(name) ? 'prev' : /next|right|forward|▶|▸|›|»/i.test(name) ? 'next' : i === 0 ? 'prev' : 'next';
      const text = textOf(link);
      if (img) {
        report.arrows++;
        report.shapes.push(shapeOf(link));
        if (img.hasAttribute(PAGER_ORIGINAL)) return;
        const size = 2 * Math.max(img.naturalWidth || img.width || 8, img.naturalHeight || img.height || 0);
        img.setAttribute(PAGER_ORIGINAL, img.getAttribute('src') ?? '');
        img.setAttribute('src', pagerImage(dir));
        img.style.setProperty('width', `${size}px`);
        img.style.setProperty('height', `${size}px`);
      } else if (/^[◀◂‹«▶▸›»<>]+$/.test(text)) {
        report.arrows++;
        report.shapes.push(shapeOf(link));
        if (link.hasAttribute(PAGER_TEXT)) return;
        link.setAttribute(PAGER_TEXT, '');
        link.style.setProperty('font-size', '200%');
      } else if (!text) {
        // An icon font (<i class="fa fa-caret-left">) or a CSS background: draw ours instead.
        report.arrows++;
        report.shapes.push(shapeOf(link));
        if (link.hasAttribute(PAGER_ICON)) return;
        link.setAttribute(PAGER_ICON, '');
        for (const kid of Array.from(link.children) as HTMLElement[]) {
          kid.setAttribute(PAGER_HIDDEN, '');
          kid.style.setProperty('display', 'none');
        }
        const ours = doc.createElement('img');
        ours.setAttribute('data-electric-mc', 'pager');
        ours.alt = dir === 'prev' ? 'Previous' : 'Next';
        ours.src = pagerImage(dir);
        ours.style.cssText = 'width:16px;height:16px;vertical-align:middle;border:0';
        link.appendChild(ours);
        // A CSS-drawn arrow is the link's own background; hide it under ours.
        const bgi = doc.defaultView?.getComputedStyle(link).backgroundImage;
        if (bgi && bgi !== 'none') link.style.setProperty('background-image', 'none');
      }
    });
  }
  return report;
}
