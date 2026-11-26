import { describe, expect, it } from 'vitest';
import { findManuscriptIds, parseManuscriptId } from '../lib/ids';
import { appendCapped, buildExport, redactEntry, safeFieldLabels, type LogEntry } from '../lib/log';
import { normalize } from '../lib/text';
import { titleFor } from '../lib/title';
import type { ParseResult } from '../parsers/types';

describe('ids', () => {
  it('parses revisions', () => {
    expect(parseManuscriptId('ID CACM-26-03-9002.R2 x')).toEqual({ id: 'CACM-26-03-9002.R2', baseId: 'CACM-26-03-9002', revision: 2 });
    expect(parseManuscriptId('TMI-2026-0123')?.baseId).toBe('TMI-2026-0123');
    expect(parseManuscriptId('IEEE-TSE-2025-01-0042')?.baseId).toBe('IEEE-TSE-2025-01-0042');
  });
  it('counts repeats', () => {
    const ids = findManuscriptIds('CACM-26-10-9003 and CACM-26-10-9003 and CACM-26-09-9004');
    expect(ids.map((x) => [x.id, x.count])).toEqual([['CACM-26-10-9003', 2], ['CACM-26-09-9004', 1]]);
  });
  it('ignores dates and phone numbers', () => {
    expect(findManuscriptIds('Submitted 02-Mar-2026, call 617-555-1212')).toEqual([]);
  });
});

describe('text', () => {
  it('normalizes nbsp, quotes and whitespace', () => {
    expect(normalize('  Author’s  name\n')).toBe("Author's name");
  });
});

const base: ParseResult = {
  parserVersion: 't', parsedAt: '2026-10-18T00:00:00Z', url: 'https://mc.manuscriptcentral.com/cacm?URL_MASK=0123456789abcdef0123456789abcdef',
  host: 'mc.manuscriptcentral.com', site: 'cacm', pageType: 'manuscript', confidence: 0.9, alternatives: [], signals: [],
  heading: 'Manuscript Information', context: null, breadcrumb: [], manuscriptIds: [{ id: 'CACM-26-03-9002.R2', baseId: 'CACM-26-03-9002', revision: 2, count: 3 }],
  manuscript: { id: 'CACM-26-03-9002.R2', baseId: 'CACM-26-03-9002', revision: 2, title: 'Secret Title', reviewers: [{ name: 'Reviewer, Robin', status: 'Agreed' }], fields: { title: 'Secret Title', 'author(s)': 'alex@example.org' } },
  fingerprint: 'abcd', strategies: {}, warnings: ['contact alex@example.org'], elapsedMs: 1,
};

describe('title', () => {
  it('names the manuscript', () => {
    expect(titleFor(base)).toBe('CACM-26-03-9002.R2 · Secret Title');
  });
  it('names queue lists', () => {
    expect(titleFor({ ...base, pageType: 'queue-list', manuscript: undefined, context: 'Associate Editor Center', heading: 'Awaiting Reviewer Scores', rows: [] }))
      .toBe('AE Center · Awaiting Reviewer Scores · 0 manuscripts');
  });
  it('leaves unknown pages alone', () => {
    expect(titleFor({ ...base, pageType: 'unknown' })).toBeNull();
  });
});

describe('log', () => {
  it('caps the ring buffer', () => {
    let l: number[] = [];
    for (let i = 0; i < 10; i++) l = appendCapped(l, i, 4);
    expect(l).toEqual([6, 7, 8, 9]);
  });
  it('redacts names, titles, emails, ids and URL masks', () => {
    const e: LogEntry = { ts: 'x', level: 'info', source: 'content', event: 'parsed', data: base };
    const out = JSON.stringify(buildExport([e], true, '0.1.0', 'ua'));
    for (const secret of ['Secret Title', 'Robin', 'alex@example.org', 'CACM-26-03-9002', '0123456789abcdef']) expect(out).not.toContain(secret);
    expect(out).toContain('fieldLabels');
    expect(out).toContain('"pageType":"manuscript"');
  });
  it('keeps only MC field labels: half a title or a name read as a label stays out', () => {
    const fields = { 'manuscript type': 'Opinion', 'in review': '8d 10h', 'an invented title': 'with a subtitle', 'sample, person': 'x', ae: 'Editor, Sample' };
    const m = { ...base.manuscript!, fields };
    const e: LogEntry = { ts: 'x', level: 'info', source: 'content', event: 'parsed', data: { ...base, manuscript: m } };
    const out = JSON.stringify(buildExport([e], true, '0.1.0', 'ua'));
    for (const secret of ['an invented title', 'subtitle', 'sample, person', 'Editor, Sample']) expect(out).not.toContain(secret);
    expect(safeFieldLabels(fields)).toEqual({ fieldLabels: ['manuscript type', 'in review', 'ae'], otherFieldLabels: 2 });
  });
  it('hashes manuscript IDs in text, and drops quoted text', () => {
    // Events that log a bare ID as text (take action after search, no version links found).
    const out = redactEntry({ ts: 'x', level: 'info', source: 'content', event: 'take action after search', data: 'XYZJ-26-01-1234.R2' }).data as string;
    expect(out).not.toContain('XYZJ-26-01-1234');
    expect(out).toMatch(/^ms_[0-9a-f]{8}\.R2$/);
    const warn = redactEntry({ ts: 'x', level: 'warn', source: 'content', event: 'w', data: 'manuscript: rejected title "A Synthetic Secret" (looks like a label)' }).data as string;
    expect(warn).not.toContain('Synthetic Secret');
    const quoted = redactEntry({ ts: 'x', level: 'warn', source: 'content', event: 'w', data: 'manuscript: rejected title "On "Quoted" Secrets and More" (looks like a label)' }).data as string;
    for (const bit of ['Quoted', 'Secrets', 'More']) expect(quoted).not.toContain(bit);
  });
  it('reduces other data to keys', () => {
    expect(redactEntry({ ts: 'x', level: 'debug', source: 'content', event: 'title', data: { from: 'Secret', to: 'MC · X' } }).data).toEqual({ keys: ['from', 'to'] });
  });
});
