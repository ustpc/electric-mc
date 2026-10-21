// Earlier versions' AE and dates, looked up offscreen. A hidden, sandboxed
// frame opens the site's dashboard, searches for the manuscript on screen,
// presses Take Action, then clicks each earlier version's Switch Details and
// reads it, all inside the frame. The sandbox has no allow-top-navigation and
// no allow-popups, so nothing MC's scripts do in the frame can move the
// person's tab (0.0.23 clicked those links on the person's own page and did).
// The top page's forms are never touched. Every step has a timeout, the whole
// lookup is aborted when the page goes away, and the frame is always removed.

import { pageClick } from './click';
import type { ManuscriptRef } from './ids';
import { decisionLettersIn, findAuditTrailLink, versionInfoFrom, type VersionInfo } from './milestones';
import { runSearch, findSearchForm, singleResultAction } from './search';
import { findVersionLinks } from './versions';
import { parsePage } from '../parsers';

export const FRAME_MARK = 'version-frame';
export const FRAME_SANDBOX = 'allow-scripts allow-forms allow-same-origin';

/** A hidden frame that can run MC's scripts but can never navigate the top page. */
export function makeSealedFrame(doc: Document, src: string): HTMLIFrameElement {
  const frame = doc.createElement('iframe');
  frame.setAttribute('sandbox', FRAME_SANDBOX);
  frame.setAttribute('data-electric-mc', FRAME_MARK);
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;visibility:hidden';
  frame.src = src;
  doc.body.appendChild(frame);
  return frame;
}

/** True inside one of our lookup frames, where the content scripts do nothing. */
export function isOurFrame(win: Window): boolean {
  try {
    return win !== win.top && win.frameElement?.getAttribute('data-electric-mc') === FRAME_MARK;
  } catch {
    return false;
  }
}

/** Raised when the frame can't be used at all (blocked from framing, logged out). */
export class Unavailable extends Error {}

/** The frame's document after its next load. */
export function nextLoad(frame: HTMLIFrameElement, timeoutMs: number, signal?: AbortSignal): Promise<Document> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      frame.removeEventListener('load', onLoad);
      signal?.removeEventListener('abort', onAbort);
    };
    const onLoad = () => {
      let d: Document | null = null;
      try {
        d = frame.contentDocument;
      } catch {
        /* cross-origin: an error page */
      }
      // The frame's first, empty document isn't a page yet.
      if (d?.location?.href === 'about:blank' && !d.body?.firstChild) return;
      cleanup();
      if (!d || !d.body) reject(new Unavailable('frame not readable (framing blocked?)'));
      else resolve(d);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('aborted'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('step timed out'));
    }, timeoutMs);
    frame.addEventListener('load', onLoad);
    signal?.addEventListener('abort', onAbort);
  });
}

export interface LookupOptions {
  doc: Document;
  /** The version on screen. */
  current: ManuscriptRef;
  /** Earlier versions (full IDs) still missing their AE. */
  wanted: string[];
  /** The previous version, when its decision date is still unknown. */
  wantResponded?: string;
  idPattern?: string;
  signal?: AbortSignal;
  stepMs?: number;
  totalMs?: number;
  /** Developer log: steps only, never names, titles or IDs. */
  log?: (event: string, data?: unknown) => void;
}

/** Look up earlier versions offscreen. Resolves with what it read, keyed by version ID. */
export async function lookupOffscreen(o: LookupOptions): Promise<Map<string, VersionInfo>> {
  const { doc, current, idPattern, signal } = o;
  const stepMs = o.stepMs ?? 15_000;
  const log = o.log ?? (() => {});
  const t0 = Date.now();
  const out = new Map<string, VersionInfo>();
  const total = new AbortController();
  const timer = setTimeout(() => total.abort(), o.totalMs ?? 30_000);
  const onAbort = () => total.abort();
  signal?.addEventListener('abort', onAbort);
  const loc = doc.defaultView!.location;
  const frame = makeSealedFrame(doc, loc.origin + loc.pathname);
  // Wait for the next page, after doing whatever leads to it.
  const step = async (act?: () => void) => {
    const p = nextLoad(frame, stepMs, total.signal);
    act?.();
    return p;
  };
  try {
    let d = await step();
    log('offscreen frame loaded');
    if (d.querySelectorAll('input[type=password]').length) throw new Unavailable('login page in frame');
    if (!findSearchForm(d)) throw new Unavailable('no search form in frame');
    d = await step(() => runSearch(d, current.id));
    log('offscreen search submitted');
    const hit = singleResultAction(d, idPattern);
    if (!hit || hit.id !== current.id) throw new Error('search did not find exactly this manuscript');
    d = await step(() => pageClick(hit.action));
    log('offscreen take action');
    const todo = new Set(o.wanted);
    for (let n = 1; todo.size; n++) {
      // Each version's page has its own Version History; find the next one wanted there.
      const link = findVersionLinks(d, current, idPattern).find((v) => todo.has(v.ref.id));
      if (!link) break;
      todo.delete(link.ref.id);
      d = await step(() => pageClick(link.link));
      const shown = parsePage(d, d.location.href, { idPattern }).manuscript?.id;
      if (shown && shown !== link.ref.id) throw new Error('switched to a different version than asked');
      const read = versionInfoFrom(d, link.ref.id);
      out.set(link.ref.id, read);
      log('offscreen version read', { n, ae: !!read.ae });
    }
    if (o.wantResponded) {
      const audit = findAuditTrailLink(d);
      if (audit) {
        d = await step(() => pageClick(audit));
        const responded = decisionLettersIn(d, idPattern).get(o.wantResponded);
        if (responded) out.set(o.wantResponded, { ...(out.get(o.wantResponded) ?? { id: o.wantResponded }), responded });
        log('offscreen audit trail read', { found: !!responded });
      }
    }
    log('offscreen done', { ms: Date.now() - t0, read: out.size });
    return out;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    frame.remove();
  }
}
