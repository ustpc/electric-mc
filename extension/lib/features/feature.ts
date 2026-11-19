// Content-script features as modules. Each feature gets the page's parse
// result and settings in a PageContext on every run (each load, bfcache
// restore and DOM change) and undoes itself in off() when the extension is
// switched off for the site. The content script runs them in the order of
// its list; features don't read storage or each other's state.

import type { Msg, Settings } from '../messages';
import type { ParseResult } from '../../parsers/types';

export interface PageContext {
  doc: Document;
  result: ParseResult;
  /** 'load', 'bfcache', 'mutation' or 'reparse'. */
  reason: string;
  settings: Settings;
  send: (m: Msg) => void;
}

export interface Feature {
  id: string;
  onPage(ctx: PageContext): void;
  /** Undo what onPage did (the extension switched off for this site). */
  off?(doc: Document): void;
}

/** Run each feature; one that throws is logged and the rest still run. */
export function runFeatures(features: Feature[], ctx: PageContext): void {
  for (const f of features) {
    try {
      f.onPage(ctx);
    } catch (e) {
      ctx.send({ type: 'log', level: 'error', event: 'feature failed', data: { feature: f.id, error: String(e) } });
    }
  }
}

export function featuresOff(features: Feature[], doc: Document): void {
  for (const f of features) {
    try {
      f.off?.(doc);
    } catch {
      /* best effort */
    }
  }
}
