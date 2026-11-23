// Content-script features as modules. Each feature gets the page's parse
// result and settings in a PageContext on every run (each load, bfcache
// restore and DOM change) and undoes itself in off() when the extension is
// switched off for the site. The content script runs them in the order of
// its lists. Features don't touch chrome.storage themselves: they name the
// stored values they follow (`watches`), which the content script loads at
// start and passes on each change, and read anything else through ctx.get.

import type { ClickBus } from '../clickbus';
import type { Msg, Settings } from '../messages';
import type { ParseResult } from '../../parsers/types';

export interface PageContext {
  doc: Document;
  result: ParseResult;
  /** 'load', 'bfcache', 'mutation', 'manual', 'settings' or 'reparse'. */
  reason: string;
  settings: Settings;
  send: (m: Msg) => void;
  /** The page's decision letters by manuscript ID (Audit Trail), read once per run. */
  letters: () => Map<string, string>;
  /** One stored value (chrome.storage.local), read when needed. */
  get: <T>(key: string) => Promise<T | undefined>;
}

/** What a feature gets once, at start. */
export interface FeatureEnv {
  doc: Document;
  clicks: ClickBus;
  /** The latest run's context, or null while the extension is off for the site. */
  current: () => PageContext | null;
}

export interface Feature {
  id: string;
  /** Once, at start: register click handlers and the like. */
  start?(env: FeatureEnv): void;
  /** Stored values (KEY.*) this feature follows. */
  watches?: readonly string[];
  /**
   * A watched value: at start (ctx null), and whenever it changes (ctx is
   * the latest run's, or null while off), so the feature can redraw.
   */
  onStored?(key: string, value: unknown, ctx: PageContext | null): void;
  onPage(ctx: PageContext): void;
  /** Undo what onPage did (the extension switched off for this site). */
  off?(doc: Document): void;
}

const failed = (send: ((m: Msg) => void) | undefined, f: Feature, e: unknown) => {
  // Also in the page's console, where it's seen even when no log is kept.
  console.warn('[electric-mc] feature failed:', f.id, e);
  send?.({ type: 'log', level: 'error', event: 'feature failed', data: { feature: f.id, error: String(e) } });
};

/** Run each feature; one that throws is logged and the rest still run. */
export function runFeatures(features: Feature[], ctx: PageContext): void {
  for (const f of features) {
    try {
      f.onPage(ctx);
    } catch (e) {
      failed(ctx.send, f, e);
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

/** Start each feature once. */
export function startFeatures(features: Feature[], env: FeatureEnv, send?: (m: Msg) => void): void {
  for (const f of features) {
    try {
      f.start?.(env);
    } catch (e) {
      failed(send, f, e);
    }
  }
}

/** Every stored key the features follow. */
export function watchedKeys(features: Feature[]): string[] {
  return [...new Set(features.flatMap((f) => f.watches ?? []))];
}

/** Hand stored values to the features that follow them (only the keys present in `values`). */
export function deliverStored(features: Feature[], values: Record<string, unknown>, ctx: PageContext | null, send?: (m: Msg) => void): void {
  for (const f of features) {
    for (const key of f.watches ?? []) {
      if (!(key in values)) continue;
      try {
        f.onStored?.(key, values[key], ctx);
      } catch (e) {
        failed(send, f, e);
      }
    }
  }
}
