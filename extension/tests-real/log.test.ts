// The live log (var/electric-mc.log): what a redacted export of it would
// hold. Reports counts only.
import { describe, expect, it } from 'vitest';
import { redactEntry, type LogEntry } from '../lib/log';
import type { ParseResult } from '../parsers/types';
import { pageTypeOf } from '../lib/mcpage';
import { files, HAVE_VAR, leaks, read } from './data';

const logs = files(/^electric-mc\.log$/);

function entries(path: string): LogEntry[] {
  const out: LogEntry[] = [];
  for (const line of read(path).split('\n')) {
    try {
      if (line.trim()) out.push(JSON.parse(line) as LogEntry);
    } catch {
      /* a line cut off by a crash */
    }
  }
  return out;
}

describe.skipIf(!HAVE_VAR || !logs.length)('the real log', () => {
  const list = logs.length ? entries(logs[0]!) : [];

  it(`redacts every entry (${list.length} entries)`, () => {
    let ids = 0;
    let emails = 0;
    const events = new Set<string>();
    for (const e of list) {
      const l = leaks(JSON.stringify(redactEntry(e)));
      ids += l.ids;
      emails += l.emails;
      if (l.ids || l.emails) events.add(e.event);
    }
    expect({ ids, emails, events: [...events].sort() }).toEqual({ ids: 0, emails: 0, events: [] });
  });

  it('keeps titles out of the redacted export', () => {
    const titles = new Set<string>();
    for (const e of list) {
      const r = e.data as Partial<ParseResult> | undefined;
      if (r?.manuscript?.title && r.manuscript.title.length > 12) titles.add(r.manuscript.title);
      for (const row of r?.rows ?? []) if (row.title && row.title.length > 12) titles.add(row.title);
    }
    let hits = 0;
    const events = new Set<string>();
    for (const e of list) {
      const red = JSON.stringify(redactEntry(e));
      for (const t of titles)
        if (red.includes(t)) {
          hits++;
          events.add(e.event);
          break;
        }
    }
    expect({ hits, events: [...events].sort() }).toEqual({ hits: 0, events: [] });
  });

  // MC's CURRENT_PAGE (logged with each page load in developer mode) against
  // what the classifier said about the same load. Page names are MC's own,
  // not manuscript data. SHOW_PAGE_NAMES=1 prints, per name, the classifier's
  // types (and the signal names where they disagree). On 2026-11-19, before
  // the classifier read CURRENT_PAGE, 22 of 377 details pages came out as
  // queue lists; parses from 0.3.0 on must agree.
  it('MC page names agree with the classifier', () => {
    const byName: Record<string, Record<string, number>> = {};
    const disagree: string[] = [];
    let pairs = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (e.event !== 'page') continue;
      const name = (e.data as { hidden?: Record<string, string> } | undefined)?.hidden?.CURRENT_PAGE;
      if (!name || !/^[A-Z][A-Z0-9_]{1,80}$/.test(name)) continue;
      const t = Date.parse(e.ts);
      // The parse of the same load: same tab, closest in time, within 3 s.
      let parsed: LogEntry | undefined;
      let best = 3000;
      for (const p of list.slice(Math.max(0, i - 12), i + 13)) {
        if (!/^parsed \((load|bfcache)\)$/.test(p.event) || p.tabId !== e.tabId) continue;
        const d = Math.abs(Date.parse(p.ts) - t);
        if (d < best) [best, parsed] = [d, p];
      }
      const type = (parsed?.data as ParseResult | undefined)?.pageType;
      if (!type) continue;
      pairs++;
      (byName[name] ??= {})[type] = (byName[name]?.[type] ?? 0) + 1;
      const implied = pageTypeOf(name);
      if (implied && implied !== type && process.env.SHOW_PAGE_NAMES) {
        const r = parsed!.data as ParseResult;
        console.log('DISAGREE', name, type, r.confidence.toFixed(2), JSON.stringify(r.signals.map((g) => `${g.pageType}:${g.name}:${g.weight}`)), 'rows', r.rows?.length ?? 0, 'ms', !!r.manuscript, 'warn', r.warnings.length);
      }
      // Parses before 0.3.0 didn't read CURRENT_PAGE; theirs are shown, not held against it.
      if ((parsed!.data as ParseResult).parserVersion < '0.3.0') continue;
      if (implied && implied !== type && !disagree.includes(`${name}: says ${implied}, classifier ${type}`)) disagree.push(`${name}: says ${implied}, classifier ${type}`);
    }
    if (process.env.SHOW_PAGE_NAMES) console.log(JSON.stringify({ pairs, byName }, null, 1));
    expect(disagree.sort()).toEqual([]);
  });
});
