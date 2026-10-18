// Debug log. Entries are kept in a ring buffer in chrome.storage.local by
// the background script. Users export it from the side panel, either
// redacted (safe to send us: no names, titles, emails or manuscript IDs) or
// full (for their own debugging).

import type { ParseResult } from '../parsers/types';
import { fnv1a } from './text';

export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: Level;
  source: 'content' | 'background' | 'sidepanel';
  event: string;
  tabId?: number;
  data?: unknown;
}

export const LOG_LIMIT = 2000;

export function appendCapped<T>(list: T[], item: T, limit = LOG_LIMIT): T[] {
  const next = list.length >= limit ? list.slice(list.length - limit + 1) : list.slice();
  next.push(item);
  return next;
}

// ---------- redaction ----------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_MASK = /(URL_MASK=)[0-9a-f]{16,}/gi;
const QUERY = /\?.*$/;

/** A stable token so the same manuscript is recognizable across a log without revealing its ID. */
export function hashId(id: string): string {
  return `ms_${fnv1a(id)}`;
}

/**
 * Keep what we need to debug parsers (page type, signals, which strategy
 * worked, structure fingerprint, counts, field labels) and drop what
 * identifies people or papers (values, names, titles, IDs, query strings).
 */
export function redactResult(r: ParseResult): unknown {
  return {
    parserVersion: r.parserVersion,
    parsedAt: r.parsedAt,
    host: r.host,
    site: r.site,
    path: safeUrl(r.url),
    pageType: r.pageType,
    confidence: r.confidence,
    alternatives: r.alternatives,
    signals: r.signals.map((s) => ({ pageType: s.pageType, name: s.name, weight: s.weight })),
    headingShape: r.heading ? shape(r.heading) : null,
    manuscriptIds: r.manuscriptIds.map((m) => ({ id: hashId(m.baseId), revision: m.revision, count: m.count })),
    manuscript: r.manuscript && {
      id: hashId(r.manuscript.baseId),
      revision: r.manuscript.revision,
      has: {
        title: !!r.manuscript.title,
        status: !!r.manuscript.status,
        type: !!r.manuscript.type,
        submitted: !!r.manuscript.submitted,
        authors: !!r.manuscript.authors,
        handlingEditor: !!r.manuscript.handlingEditor,
      },
      reviewerCount: r.manuscript.reviewers.length,
      reviewerStatuses: r.manuscript.reviewers.map((p) => p.status ?? null),
      fieldLabels: Object.keys(r.manuscript.fields),
    },
    queues: r.queues?.map((q) => ({ name: q.name, count: q.count })),
    rows: r.rows && {
      count: r.rows.length,
      columns: [...new Set(r.rows.flatMap((x) => Object.keys(x.cells)))],
      withTitle: r.rows.filter((x) => x.title).length,
      withStatus: r.rows.filter((x) => x.status).length,
    },
    fingerprint: r.fingerprint,
    strategies: r.strategies,
    warnings: r.warnings.map(scrub),
    elapsedMs: r.elapsedMs,
  };
}

/** Replace letters with x and digits with 9, keeping length and punctuation. */
export function shape(s: string): string {
  return s.replace(/[A-Za-z]/g, 'x').replace(/\d/g, '9').slice(0, 80);
}

export function scrub(s: string): string {
  return s.replace(EMAIL, '<email>').replace(URL_MASK, '$1<mask>');
}

function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return scrub(url.replace(QUERY, ''));
  }
}

export function redactEntry(e: LogEntry): LogEntry {
  let data: unknown = e.data;
  if (isParse(data)) data = redactResult(data);
  else if (data && typeof data === 'object') data = { keys: Object.keys(data as object) };
  else if (typeof data === 'string') data = scrub(data);
  return { ...e, data };
}

function isParse(x: unknown): x is ParseResult {
  return !!x && typeof x === 'object' && 'parserVersion' in x && 'pageType' in x && 'signals' in x;
}

export interface LogExport {
  kind: 'electric-mc-log';
  redacted: boolean;
  exportedAt: string;
  extensionVersion: string;
  userAgent: string;
  entries: LogEntry[];
}

export function buildExport(entries: LogEntry[], redacted: boolean, extensionVersion: string, userAgent: string): LogExport {
  return {
    kind: 'electric-mc-log',
    redacted,
    exportedAt: new Date().toISOString(),
    extensionVersion,
    userAgent,
    entries: redacted ? entries.map(redactEntry) : entries,
  };
}
