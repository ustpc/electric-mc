// The live log (var/electric-mc.log): what a redacted export of it would
// hold. Reports counts only.
import { describe, expect, it } from 'vitest';
import { redactEntry, type LogEntry } from '../lib/log';
import type { ParseResult } from '../parsers/types';
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
});
