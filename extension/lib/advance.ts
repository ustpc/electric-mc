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
const TASK_KEY = 'emc-carry-task';
const OPENED_KEY = 'emc-opened-task';

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
}

/**
 * On a new manuscript after moving on from `from` while on a task, open the
 * same task if this manuscript has it and isn't showing it. Once per move.
 */
export function carryTask(doc: Document, current: string | undefined): string | null {
  const view = doc.defaultView!;
  const carry = read<Carry>(view, TASK_KEY);
  if (!carry || !current || current === carry.from) return null;
  write(view, TASK_KEY, null);
  if (Date.now() - carry.at > PENDING_MS) return null;
  if (currentTask(doc) === carry.task) return null;
  const link = taskLinks(doc).get(carry.task);
  if (!link) return null;
  pageClick(link);
  return carry.task;
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
  const opened = read<Opened>(view, OPENED_KEY);
  return (opened && opened.from === from ? opened.task : null) ?? currentTask(doc);
}

function rememberTask(view: Window, doc: Document, from: string | undefined) {
  const task = taskOn(view, doc, from);
  if (task && from) write(view, TASK_KEY, { task, from, at: Date.now() } satisfies Carry);
  // Our own arrow press after a recommendation, on a page whose task is
  // done: keep the task noted when the recommendation was sent.
  else if (read<Carry>(view, TASK_KEY)?.from !== from) write(view, TASK_KEY, null);
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
    const from = current();
    // The first task link opened on this manuscript is the one to carry.
    const link = t?.closest('a');
    const name = link && !link.closest('[data-electric-mc]') ? taskName(textOf(link)) : null;
    if (name && from && read<Opened>(view, OPENED_KEY)?.from !== from) write(view, OPENED_KEY, { from, task: name } satisfies Opened);
    if (bar && t) {
      const arrow = bar.next?.contains(t) ? 1 : bar.prev?.contains(t) ? -1 : 0;
      if (arrow) {
        write(view, DIR_KEY, arrow);
        rememberTask(view, doc, from);
      }
    }
    if (from && isRecommendationSubmit(e.target)) {
      write(view, PENDING_KEY, { from, dir: read<Dir>(view, DIR_KEY) ?? 1, at: Date.now() } satisfies Pending);
      rememberTask(view, doc, from);
    }
  };
  doc.addEventListener('click', listener, true);
  return () => doc.removeEventListener('click', listener, true);
}
