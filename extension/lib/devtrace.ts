// Developer trace: in developer mode, what the person does on MC's pages
// goes into the log (and so the live log file), so a session can be
// replayed afterwards: every click (which control, its label, the section
// it's in, what its link runs), and on every page load the address, the
// action MC was asked for (XIK_TAGACT and hidden form fields), any JSON
// MC embeds in the page, and its analytics metadata (who, which role). Typed text is never recorded: text boxes,
// password fields and text areas give only their name. Also every request
// the page's own scripts make after it loads (XHR, fetch, beacons; MC's
// AJAX servlet is the one known so far), by path and query parameter names,
// so we learn which parts of MC run in the browser. All of this is real
// manuscript data, kept only in this browser and the local log file.

import { onClick, type ClickBus } from './clickbus';
import { textOf } from './text';

const CONTROL = 'a, button, input, select, textarea, label, [onclick], [role=button], img[onclick]';
const MAX = 120;

const clip = (s: string | null | undefined, n = MAX) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** The heading of the section an element is in ("Co-Chair Recommends"), if any. */
function sectionOf(el: Element): string | undefined {
  for (let up: Element | null = el.parentElement, i = 0; up && i < 8; up = up.parentElement, i++) {
    const head = up.querySelector(':scope > tbody > tr:first-child > th, :scope > tbody > tr:first-child > td, :scope > b, :scope > h2, :scope > h3, :scope > .hdr');
    const t = head && head !== el && !head.contains(el) ? textOf(head) : '';
    if (t && t.length <= 60) return t;
  }
  return undefined;
}

export interface ClickTrace {
  tag: string;
  id?: string;
  name?: string;
  type?: string;
  label?: string;
  checked?: boolean;
  section?: string;
  /** What the link runs, or where it goes (javascript: links are MC's actions). */
  href?: string;
  onclick?: string;
}

/** A description of what was clicked, without anything the person typed. */
export function describeClick(target: EventTarget | null): ClickTrace | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(CONTROL) ?? target;
  const input = el as HTMLInputElement;
  const typed = el.matches('textarea, input:not([type]), input[type=text], input[type=password], input[type=email], input[type=search]');
  const label = typed
    ? undefined
    : clip(el.getAttribute('aria-label') || (el.tagName === 'INPUT' ? input.value : '') || el.getAttribute('alt') || el.querySelector('img')?.getAttribute('alt') || textOf(el) || el.getAttribute('title'), 60);
  const out: ClickTrace = { tag: el.tagName.toLowerCase() };
  if (el.id) out.id = el.id;
  if (el.getAttribute('name')) out.name = el.getAttribute('name')!;
  if (input.type && el.tagName === 'INPUT') out.type = input.type;
  if (label) out.label = label;
  if (el.matches('input[type=radio], input[type=checkbox]')) out.checked = input.checked;
  const section = sectionOf(el);
  if (section) out.section = section;
  const href = el.closest('a')?.getAttribute('href');
  if (href && href !== '#') out.href = clip(href);
  const onclick = el.closest('[onclick]')?.getAttribute('onclick');
  if (onclick) out.onclick = clip(onclick);
  return out;
}

export interface PageTrace {
  url: string;
  title: string;
  /** MC's action for this page, from XIK_TAGACT or the form's hidden fields. */
  action?: string;
  hidden: Record<string, string>;
  json: string[];
  /** MC's analytics metadata (initializePendoMetadata: visitor, role, account), as text. */
  pendo?: string;
}

/** The page's address, MC's hidden form state, and any JSON it embeds. */
export function describePage(doc: Document): PageTrace {
  const hidden: Record<string, string> = {};
  for (const input of Array.from(doc.querySelectorAll<HTMLInputElement>('form input[type=hidden]'))) {
    const key = input.name || input.id;
    if (key && !(key in hidden) && Object.keys(hidden).length < 60) hidden[key] = clip(input.value, 200);
  }
  const json = Array.from(doc.querySelectorAll('script[type*="json"]')).map((s) => clip(s.textContent, 2000));
  const action = hidden.XIK_TAGACT ?? hidden.NEXT_PAGE ?? hidden.CURRENT_PAGE ?? undefined;
  const out: PageTrace = { url: doc.location.href, title: doc.title, action, hidden, json };
  // Read as text, never run (see lib/identity.ts).
  for (const s of Array.from(doc.querySelectorAll('script:not([src])'))) {
    const text = s.textContent ?? '';
    const at = text.indexOf('initializePendoMetadata');
    if (at >= 0) out.pendo = clip(text.slice(at), 3000);
  }
  return out;
}

/**
 * Log every click while `enabled()` (developer mode). Returns a function that
 * stops. Clicks are logged as they happen, before MC's handlers navigate.
 */
export function watchClicks(doc: Document, enabled: () => boolean, log: (c: ClickTrace) => void, bus?: ClickBus): () => void {
  const listener = (e: MouseEvent) => {
    if (!enabled()) return;
    const c = describeClick(e.target);
    if (c && (c.tag !== 'div' || c.onclick)) log(c);
  };
  return onClick(doc, bus, 'trace', listener);
}

export interface RequestTrace {
  /** xmlhttprequest, fetch or beacon. */
  kind: string;
  /** Path on the same host, or host and path elsewhere; never the query values. */
  path: string;
  /** The query's parameter names, sorted. */
  params: string[];
  ms: number;
  bytes?: number;
  status?: number;
}

const SCRIPTED = new Set(['xmlhttprequest', 'fetch', 'beacon']);

/** One resource timing entry as a trace, or null for what the page itself loads (images, scripts, CSS). */
export function describeRequest(e: { name: string; initiatorType: string; duration: number; transferSize?: number; responseStatus?: number }, here: string): RequestTrace | null {
  if (!SCRIPTED.has(e.initiatorType)) return null;
  let u: URL;
  try {
    u = new URL(e.name, here);
  } catch {
    return null;
  }
  const same = u.host === new URL(here).host;
  const out: RequestTrace = {
    kind: e.initiatorType,
    path: clip(same ? u.pathname : `${u.host}${u.pathname}`, 200),
    params: [...new Set(u.searchParams.keys())].sort(),
    ms: Math.round(e.duration),
  };
  if (e.transferSize) out.bytes = e.transferSize;
  if (e.responseStatus) out.status = e.responseStatus;
  return out;
}

/**
 * Log each scripted request while `enabled()` (developer mode). Returns a
 * function that stops. Resource timing sees requests from the page's own
 * scripts, which the content script can't otherwise see.
 */
export function watchRequests(view: Window, enabled: () => boolean, log: (r: RequestTrace) => void): () => void {
  const PO = (view as Window & { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
  if (!PO) return () => {};
  const po = new PO((list) => {
    if (!enabled()) return;
    for (const e of list.getEntries() as PerformanceResourceTiming[]) {
      const r = describeRequest(e, view.location.href);
      if (r) log(r);
    }
  });
  try {
    po.observe({ type: 'resource', buffered: false });
  } catch {
    return () => {};
  }
  return () => po.disconnect();
}
