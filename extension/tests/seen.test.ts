import { describe, expect, it } from 'vitest';
import { filterSeen } from '../lib/seen';
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
