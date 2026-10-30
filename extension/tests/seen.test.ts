import { describe, expect, it } from 'vitest';
import { filterSeen, pruneSeen } from '../lib/seen';
import type { SeenManuscript } from '../lib/messages';

const m = (latestId: string, title?: string): SeenManuscript =>
  ({ baseId: latestId.replace(/\.R\d+$/, ''), latestId, site: null, title, firstSeen: '', lastSeen: '', seenOn: [] }) as unknown as SeenManuscript;

const LIST = [m('CACM-24-04-1000.R2', 'This Is a Test'), m('CACM-24-04-2000', 'A Synthetic Search Title'), m('CACM-24-05-3000')];

describe('filterSeen', () => {
  it('matches any part of the ID', () => {
    expect(filterSeen(LIST, '04-20').map((x) => x.latestId)).toEqual(['CACM-24-04-2000']);
    expect(filterSeen(LIST, '.r2').map((x) => x.latestId)).toEqual(['CACM-24-04-1000.R2']);
  });
  it('matches any part of the title, ignoring case', () => {
    expect(filterSeen(LIST, 'SEARCH').map((x) => x.latestId)).toEqual(['CACM-24-04-2000']);
  });
  it('keeps everything for an empty query', () => {
    expect(filterSeen(LIST, '  ')).toHaveLength(3);
  });
});

describe('pruneSeen', () => {
  const NOW = new Date('2026-10-22T12:00:00Z');
  const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
  const at = (baseId: string, lastSeen: string) => ({ ...m(baseId), lastSeen });
  const seen = {
    'XYZJ-24-01-9001': at('XYZJ-24-01-9001', daysAgo(730)),
    'XYZJ-24-01-9002': at('XYZJ-24-01-9002', daysAgo(731)),
    'XYZJ-26-01-9003': at('XYZJ-26-01-9003', daysAgo(1)),
  };
  const notes = {
    'XYZJ-24-01-9001': 'kept: at the limit',
    'XYZJ-24-01-9002': 'dropped with its manuscript',
    'XYZJ-24-01-9002.R1': 'dropped too: a version of it',
    'XYZJ-24-01-90021': 'kept: a different ID',
    'XYZJ-26-01-9003': 'kept: recent',
    'XYZJ-20-01-9999': 'kept: matches no Seen entry',
  };

  it('keeps an entry exactly at the limit and drops one a day over', () => {
    const r = pruneSeen(seen, notes, NOW);
    expect(Object.keys(r.seen).sort()).toEqual(['XYZJ-24-01-9001', 'XYZJ-26-01-9003']);
    expect(r.dropped).toBe(1);
  });

  it('drops the notes of dropped manuscripts and keeps the rest', () => {
    const r = pruneSeen(seen, notes, NOW);
    expect(Object.keys(r.notes).sort()).toEqual(['XYZJ-20-01-9999', 'XYZJ-24-01-9001', 'XYZJ-24-01-90021', 'XYZJ-26-01-9003']);
  });

  it('keeps an entry with an unreadable date', () => {
    expect(pruneSeen({ x: at('XYZJ-24-01-9004', '') }, {}, NOW).dropped).toBe(0);
  });
});

