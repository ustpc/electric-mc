// Go on to the next manuscript after a recommendation or decision. On a manuscript's
// details page MC shows "7 / 8" between previous and next arrows. The
// direction we're moving is remembered per tab: starting at the first one
// means forward, at the last one backward, and pressing an arrow sets it.
// When the person presses Submit in a Recommends table with a choice made,
// we note where we were; on the next details or queue page we press the
// arrow in that direction, or open the next manuscript in the grid. MC may
// show either after a recommendation, so both are handled.

import { onClick, type ClickBus } from './clickbus';
import { isSubmitWithChoice, submitControl } from './recommendform';
import { tabGet, tabSet, type TabKey } from './tabstate';
import { pageClick } from './click';
import { gridActions } from './idlink';
import { labelKey, textOf } from './text';

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

/** A press that sends a recommendation or a decision with a choice made (lib/recommendform.ts). */
export const isRecommendationSubmit = isSubmitWithChoice;

/** The Submit or Commit Decision control a press is on (lib/recommendform.ts). */
export const recommendationSubmitControl = submitControl;

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

/** A task link's name: "Make Recommendation (Due 25-Oct-2026)" is "make recommendation". */
export function taskName(text: string): string | null {
  const key = labelKey(text.replace(/\(due[^)]*\)/i, ''));
  return /^((co-chair|ae|eic|adm|admin|associate editor|editor)\s+)?(make|assign|invite|score)\b/.test(key) && key.length < 40 ? key : null;
}

/** The task links on a manuscript's page (MC's header list and tabs), by name. */
export function taskLinks(doc: Document): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>();
  for (const a of Array.from(doc.querySelectorAll<HTMLElement>('a'))) {
    if (a.closest('[data-electric-mc]')) continue;
    const name = taskName(textOf(a));
    if (name && !out.has(name)) out.set(name, a);
  }
  return out;
}

/**
 * The task on screen: a task whose name is a heading or tab that isn't a
 * link ("Make Immediate Decision"), or ends one ("Co-Chair Make
 * Recommendation"; "Co-Chair Immediate Decision" for Make Immediate
 * Decision). The most specific match wins.
 */
export function currentTask(doc: Document): string | null {
  const names = Array.from(taskLinks(doc).keys());
  if (!names.length) return null;
  const labels: string[] = [];
  for (const e of Array.from(doc.querySelectorAll<HTMLElement>('th, td, div, span, b, strong, h1, h2, h3, h4, li, p'))) {
    if (e.children.length > 2 || e.closest('a, [data-electric-mc]') || e.querySelector('a')) continue;
    const t = textOf(e);
    if (t && t.length < 60) labels.push(labelKey(t));
  }
  let best: string | null = null;
  let score = 0;
  for (const name of names) {
    const core = name.replace(/^make /, '');
    for (const l of labels) {
      const s = l === name ? 1000 : l.endsWith(name) ? 500 + name.length : l.endsWith(core) && core.includes(' ') ? core.length : 0;
      if (s > score) [best, score] = [name, s];
    }
  }
  return best;
}

interface Carry {
  task: string;
  from: string;
  at: number;
  /** When the next manuscript first loaded without the task's link. */
  waiting?: number;
}

const LINK_WAIT_MS = 10_000;

/** What carryTask did on a new manuscript, for the log. */
export interface CarryResult {
  task: string;
  done: 'opened' | 'no link' | 'expired';
  /** The task links the page did have, when it lacked this one. */
  found?: string[];
}

/**
 * On a new manuscript after moving on from `from` while on a task, open the
 * same task's link if this manuscript has one. Once per move: the click
 * reloads the same manuscript, and the note is gone by then. (MC's tabs can
 * name a task the page isn't showing, so we don't try to tell.)
 */
export function carryTask(doc: Document, current: string | undefined): CarryResult | null {
  const view = doc.defaultView!;
  const carry = read<Carry>(view, 'carryTask');
  if (!carry || !current || current === carry.from) return null;
  if (Date.now() - carry.at > PENDING_MS) {
    write(view, 'carryTask', null);
    return { task: carry.task, done: 'expired' };
  }
  const link = taskLinks(doc).get(carry.task);
  if (!link) {
    // MC may draw the header after the load; look again as the page changes.
    const waiting = carry.waiting ?? Date.now();
    if (Date.now() - waiting < LINK_WAIT_MS) {
      write(view, 'carryTask', { ...carry, waiting } satisfies Carry);
      return null;
    }
    write(view, 'carryTask', null);
    return { task: carry.task, done: 'no link', found: Array.from(taskLinks(doc).keys()) };
  }
  write(view, 'carryTask', null);
  pageClick(link);
  return { task: carry.task, done: 'opened' };
}

interface Opened {
  from: string;
  task: string;
}

/**
 * The task the person opened on this manuscript ("Co-Chair Make
 * Recommendation"), else the one on screen. MC's recommendation form has no
 * task links, so the click is what tells.
 */
function taskOn(view: Window, doc: Document, from: string | undefined): string | null {
  const opened = read<Opened>(view, 'openedTask');
  return (opened && opened.from === from ? opened.task : null) ?? currentTask(doc);
}

/** The task the person is doing on manuscript `from`, if we can tell. */
export function openedTask(doc: Document, from: string | undefined): string | null {
  return taskOn(doc.defaultView!, doc, from);
}

function rememberTask(view: Window, doc: Document, from: string | undefined) {
  const task = taskOn(view, doc, from);
  if (task && from) write(view, 'carryTask', { task, from, at: Date.now() } satisfies Carry);
  // Our own arrow press after a recommendation, on a page whose task is
  // done: keep the task noted when the recommendation was sent.
  else if (read<Carry>(view, 'carryTask')?.from !== from) write(view, 'carryTask', null);
}

interface Pending {
  from: string;
  dir: Dir;
  at: number;
}

const read = <T>(view: Window, key: TabKey): T | null => tabGet<T>(view, key);
const write = (view: Window, key: TabKey, value: unknown): void => tabSet(view, key, value);

/** Forget a pending advance and task carry-over (one-button reject leads elsewhere). */
export function cancelAdvance(where: Document | Window): void {
  tabSet(where, 'advance', null);
  tabSet(where, 'carryTask', null);
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
  const last = read<Dir>(view, 'navDir') ?? 1;
  if (bar) write(view, 'navDir', directionAt(bar.position, bar.total, last));
  const grid = gridActions(doc, idPattern);
  const before = read<string[]>(view, 'gridOrder') ?? [];
  if (grid.length) write(view, 'gridOrder', grid.map((g) => g.id));

  const pending = read<Pending>(view, 'advance');
  if (!pending || Date.now() - pending.at > PENDING_MS) {
    if (pending) write(view, 'advance', null);
    return null;
  }
  // Wait for a details page or a grid; other pages (confirmations) pass.
  if (!bar && !grid.length) return null;
  write(view, 'advance', null);
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
export function watchRecommendations(doc: Document, current: () => string | undefined, enabled: () => boolean, bus?: ClickBus): () => void {
  const view = doc.defaultView!;
  const listener = (e: MouseEvent) => {
    if (!enabled()) return;
    const bar = findNavBar(doc);
    const t = e.target instanceof Element ? e.target : null;
    const from = current();
    // The first task link opened on this manuscript is the one to carry.
    const link = t?.closest('a');
    const name = link && !link.closest('[data-electric-mc]') ? taskName(textOf(link)) : null;
    if (name && from && read<Opened>(view, 'openedTask')?.from !== from) write(view, 'openedTask', { from, task: name } satisfies Opened);
    if (bar && t) {
      const arrow = bar.next?.contains(t) ? 1 : bar.prev?.contains(t) ? -1 : 0;
      if (arrow) {
        write(view, 'navDir', arrow);
        rememberTask(view, doc, from);
      }
    }
    if (from && isRecommendationSubmit(e.target)) {
      write(view, 'advance', { from, dir: read<Dir>(view, 'navDir') ?? 1, at: Date.now() } satisfies Pending);
      rememberTask(view, doc, from);
    }
  };
  return onClick(doc, bus, 'act', listener);
}
