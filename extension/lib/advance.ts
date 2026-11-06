// Go on to the next manuscript after a recommendation or decision. On a manuscript's
// details page MC shows "7 / 8" between previous and next arrows. The
// direction we're moving is remembered per tab: starting at the first one
// means forward, at the last one backward, and pressing an arrow sets it.
// When the person presses Submit in a Recommends table with a choice made,
// we note where we were; on the next details or queue page we press the
// arrow in that direction, or open the next manuscript in the grid. MC may
// show either after a recommendation, so both are handled.

import { pageClick } from './click';
import { gridActions } from './idlink';
import { labelKey, textOf } from './text';

const DIR_KEY = 'emc-nav-dir';
const PENDING_KEY = 'emc-advance';
const ORDER_KEY = 'emc-grid-order';
const PENDING_MS = 3 * 60_000;

export type Dir = 1 | -1;

export interface NavBar {
  position: number;
  total: number;
  prev: HTMLElement | null;
  next: HTMLElement | null;
}

const ARROW = 'img[src*="next_mss"], img[src*="prev_mss"], img[src*="previous_mss"], img[alt="Next Document"], img[alt="Previous Document"], img[data-emc-src]';
const clickable = (img: Element) => img.closest<HTMLElement>('a, button, [onclick]') ?? (img as HTMLElement);

/** MC's "k / N" navigator on a details page, or null. */
export function findNavBar(doc: Document): NavBar | null {
  let prev: HTMLElement | null = null;
  let next: HTMLElement | null = null;
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>(ARROW))) {
    const name = `${img.getAttribute('data-emc-src') ?? img.getAttribute('src') ?? ''} ${img.alt}`;
    if (/prev/i.test(name)) prev ??= clickable(img);
    else if (/next/i.test(name)) next ??= clickable(img);
  }
  const anchor = next ?? prev;
  if (!anchor) return null;
  // The counter sits between the arrows, in their shared container.
  for (let el: Element | null = anchor.parentElement, i = 0; el && i < 4; el = el.parentElement, i++) {
    const m = /\b(\d+)\s*\/\s*(\d+)\b/.exec(textOf(el));
    if (m) return { position: Number(m[1]), total: Number(m[2]), prev, next };
  }
  return null;
}

/** The direction to keep moving: the ends decide, otherwise the last one used. */
export function directionAt(position: number, total: number, last: Dir): Dir {
  if (total > 1 && position === 1) return 1;
  if (total > 1 && position === total) return -1;
  return last;
}

/**
 * A press that sends a recommendation or a decision: Submit in a
 * "… Recommends" table, or Commit Decision in a "… Decision" box (a
 * co-chair's immediate reject), with a choice made on the page.
 */
export function isRecommendationSubmit(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const control = target.closest('a, button, input[type=submit], input[type=button], input[type=image]');
  if (!control) return false;
  const label = labelKey(textOf(control) || control.getAttribute('value') || control.getAttribute('alt') || control.querySelector('img')?.getAttribute('alt') || '');
  const heading = label === 'submit' ? /recommends$/ : /^(commit|submit) decision$/.test(label) ? /(recommends|decision)$/ : null;
  if (!heading) return false;
  // A matching section heading, and a choice made on the page.
  const doc = control.ownerDocument;
  const found = Array.from(doc.querySelectorAll('th, td, div, span, b, h2, h3, h4')).some(
    (e) => e.children.length <= 2 && !control.contains(e) && !e.contains(control) && heading.test(labelKey(textOf(e))) && textOf(e).length < 60,
  );
  return found && !!doc.querySelector('input[type=radio]:checked');
}

/** The manuscript to open next on a grid, by its order now or as it was. */
export function nextInGrid(current: string[], from: string, dir: Dir, before: string[]): string | null {
  const i = current.indexOf(from);
  if (i >= 0) return current[i + dir] ?? null;
  // It left the list: take its old neighbour that is still there.
  const j = before.indexOf(from);
  if (j < 0) return null;
  for (let k = j + dir; k >= 0 && k < before.length; k += dir) if (current.includes(before[k]!)) return before[k]!;
  return null;
}

interface Pending {
  from: string;
  dir: Dir;
  at: number;
}

function store(view: Window) {
  try {
    return view.sessionStorage;
  } catch {
    return null;
  }
}

function read<T>(view: Window, key: string): T | null {
  try {
    const raw = store(view)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(view: Window, key: string, value: unknown) {
  try {
    if (value === null) store(view)?.removeItem(key);
    else store(view)?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
}

export interface AdvanceResult {
  from: string;
  to: string | null;
  how: 'arrow' | 'grid' | 'end';
}

/**
 * On each page load: keep the direction up to date, remember a grid's order,
 * and carry out a pending advance. `current` is the manuscript on screen.
 */
export function onPageLoad(doc: Document, current: string | undefined, enabled: boolean, idPattern?: string): AdvanceResult | null {
  const view = doc.defaultView!;
  const bar = findNavBar(doc);
  const last = read<Dir>(view, DIR_KEY) ?? 1;
  if (bar) write(view, DIR_KEY, directionAt(bar.position, bar.total, last));
  const grid = gridActions(doc, idPattern);
  const before = read<string[]>(view, ORDER_KEY) ?? [];
  if (grid.length) write(view, ORDER_KEY, grid.map((g) => g.id));

  const pending = read<Pending>(view, PENDING_KEY);
  if (!pending || Date.now() - pending.at > PENDING_MS) {
    if (pending) write(view, PENDING_KEY, null);
    return null;
  }
  // Wait for a details page or a grid; other pages (confirmations) pass.
  if (!bar && !grid.length) return null;
  write(view, PENDING_KEY, null);
  if (!enabled) return null;
  if (bar) {
    // MC already moved on by itself: leave it there.
    if (current && current !== pending.from) return null;
    const arrow = pending.dir === 1 ? bar.next : bar.prev;
    const atEnd = pending.dir === 1 ? bar.position >= bar.total : bar.position <= 1;
    if (!arrow || atEnd) return { from: pending.from, to: null, how: 'end' };
    pageClick(arrow);
    return { from: pending.from, to: `${bar.position + pending.dir} / ${bar.total}`, how: 'arrow' };
  }
  const to = nextInGrid(grid.map((g) => g.id), pending.from, pending.dir, before);
  const target = grid.find((g) => g.id === to);
  if (!target) return { from: pending.from, to: null, how: 'end' };
  pageClick(target.action);
  return { from: pending.from, to: target.id, how: 'grid' };
}

/**
 * Watch for Submit on a recommendation (note where we were) and for presses
 * of MC's arrows (they set the direction). Returns a function that stops.
 */
export function watchRecommendations(doc: Document, current: () => string | undefined, enabled: () => boolean): () => void {
  const view = doc.defaultView!;
  const listener = (e: MouseEvent) => {
    if (!enabled()) return;
    const bar = findNavBar(doc);
    const t = e.target instanceof Element ? e.target : null;
    if (bar && t) {
      if (bar.next?.contains(t)) write(view, DIR_KEY, 1);
      else if (bar.prev?.contains(t)) write(view, DIR_KEY, -1);
    }
    const from = current();
    if (from && isRecommendationSubmit(e.target)) write(view, PENDING_KEY, { from, dir: read<Dir>(view, DIR_KEY) ?? 1, at: Date.now() } satisfies Pending);
  };
  doc.addEventListener('click', listener, true);
  return () => doc.removeEventListener('click', listener, true);
}
