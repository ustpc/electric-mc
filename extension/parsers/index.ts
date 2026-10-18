// parsePage(): the one function the content script, the tests and the
// validate tool all call. It never throws; failures become warnings so the
// log always has something to show.

import { findManuscriptIds } from '../lib/ids';
import { fnv1a, textOf } from '../lib/text';
import { classify } from './classify';
import { breadcrumb, cleanDocument, headings, skeleton } from './dom';
import { extractManuscript, extractQueues, extractRows } from './extract';
import { PARSER_VERSION, type ParseResult, type ParserConfig } from './types';

export * from './types';

export function siteFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/manuscriptcentral\.com$/.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg ?? null;
  } catch {
    return null;
  }
}

export function parsePage(live: Document, url: string, config: ParserConfig = {}): ParseResult {
  const t0 = now();
  const warnings: string[] = [];
  const strategies: Record<string, string> = {};
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    warnings.push(`bad url: ${url}`);
  }

  const base: ParseResult = {
    parserVersion: PARSER_VERSION,
    parsedAt: new Date().toISOString(),
    url,
    host,
    site: siteFromUrl(url),
    pageType: 'unknown',
    confidence: 0,
    alternatives: [],
    signals: [],
    heading: null,
    context: null,
    breadcrumb: [],
    manuscriptIds: [],
    fingerprint: '',
    strategies,
    warnings,
    elapsedMs: 0,
  };

  const step = <T>(name: string, fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (e) {
      warnings.push(`${name} failed: ${(e as Error).message}`);
      return undefined;
    }
  };

  step('fingerprint', () => (base.fingerprint = fnv1a(skeleton(live))));
  // Parse a copy without the hidden cookie dialog and other hidden elements.
  const doc = step('clean', () => cleanDocument(live)) ?? live;
  step('headings', () => {
    const h = headings(doc);
    base.breadcrumb = breadcrumb(doc) ?? [];
    base.heading = h[0] ?? null;
    base.context = base.breadcrumb[0] ?? h.find((x) => /center|dashboard/i.test(x)) ?? null;
  });
  step('ids', () => (base.manuscriptIds = findManuscriptIds(textOf(doc.body), config.idPattern)));
  const c = step('classify', () => classify(doc, config.idPattern, live.defaultView));
  if (c) Object.assign(base, c);

  const merge = (x: { strategies: Record<string, string>; warnings: string[] } | undefined, prefix: string) => {
    if (!x) return;
    for (const [k, v] of Object.entries(x.strategies)) strategies[`${prefix}.${k}`] = v;
    warnings.push(...x.warnings);
  };

  switch (base.pageType) {
    case 'role-center': {
      const q = step('queues', () => extractQueues(doc));
      if (q) base.queues = q.value;
      merge(q, 'queues');
      break;
    }
    case 'queue-list': {
      const r = step('rows', () => extractRows(doc, config.idPattern));
      if (r) base.rows = r.value;
      merge(r, 'rows');
      break;
    }
    case 'manuscript':
    case 'popup': {
      const m = step('manuscript', () => extractManuscript(doc, config.idPattern));
      if (m?.value) base.manuscript = m.value;
      // A popup often has no manuscript; only warn on real manuscript pages.
      if (base.pageType === 'manuscript') merge(m, 'manuscript');
      else if (m?.value) merge({ strategies: m.strategies, warnings: [] }, 'manuscript');
      break;
    }
    case 'unknown':
      warnings.push('page type unknown');
      break;
  }
  if (base.confidence > 0 && base.confidence < 0.5) warnings.push(`low confidence ${base.confidence} for ${base.pageType}`);

  base.elapsedMs = Math.round((now() - t0) * 10) / 10;
  return base;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
