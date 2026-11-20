import { describe, expect, it } from 'vitest';
import { applyEic, mergeFlags, mergeSeen, mergeVersion, revisionOf, seenUpdates } from '../lib/model';
import type { ParseResult } from '../parsers/types';

const NOW = '2026-11-20T00:00:00.000Z';
const LATER = '2026-11-21T00:00:00.000Z';

describe('Seen', () => {
  it('reads the manuscript on a details page and the rows of a queue list only', () => {
    const ms = { pageType: 'manuscript', manuscript: { baseId: 'XYZJ-26-09-9011', id: 'XYZJ-26-09-9011.R1', title: 'This is a test!', status: 'Awaiting AE', reviewers: [], handlingEditor: 'Not Assigned' }, rows: [{ baseId: 'XYZJ-26-09-9012', id: 'XYZJ-26-09-9012' }] } as unknown as ParseResult;
    expect(seenUpdates(ms)).toEqual([{ baseId: 'XYZJ-26-09-9011', latestId: 'XYZJ-26-09-9011.R1', title: 'This is a test!', status: 'Awaiting AE', reviewers: 0, aeByVersion: undefined }]);
    const q = { pageType: 'queue-list', heading: 'Awaiting AE', rows: [{ baseId: 'XYZJ-26-09-9012', id: 'XYZJ-26-09-9012', title: 'T', status: 'S' }] } as unknown as ParseResult;
    expect(seenUpdates(q)).toEqual([{ baseId: 'XYZJ-26-09-9012', latestId: 'XYZJ-26-09-9012', title: 'T', status: 'S', queue: 'Awaiting AE' }]);
  });

  it('keeps the highest revision, every AE, the first sighting, and fields over blanks', () => {
    let seen = mergeSeen({}, [{ baseId: 'B', latestId: 'B.R2', title: 'T', aeByVersion: { 'B.R2': 'Editor, Pat' } }], 'xyzj', 'manuscript', NOW);
    seen = mergeSeen(seen, [{ baseId: 'B', latestId: 'B.R1', title: '', aeByVersion: { 'B.R1': 'Editor, Robin' } }], 'xyzj', 'queue-list', LATER);
    expect(seen.B).toMatchObject({ latestId: 'B.R2', title: 'T', firstSeen: NOW, lastSeen: LATER, seenOn: ['manuscript', 'queue-list'], aeByVersion: { 'B.R1': 'Editor, Robin', 'B.R2': 'Editor, Pat' } });
    expect(revisionOf('B')).toBe(0);
    expect(revisionOf('B.R12')).toBe(12);
  });

  it('merges one version at a time, ignoring "Not Assigned"', () => {
    expect(mergeVersion({}, 'B', 'B', NOW, 'Not Assigned')).toBeNull();
    let seen = mergeVersion({}, 'B', 'B', NOW, 'Editor, Pat', undefined, { id: 'B', submitted: '01-Sep-2026' })!;
    seen = mergeVersion(seen, 'B', 'B', LATER, undefined, 'Reject', { id: 'B', responded: '09-Sep-2026', ae: 'Not Assigned' })!;
    expect(seen.B).toMatchObject({ aeByVersion: { B: 'Editor, Pat' }, statusByVersion: { B: 'Reject' }, versionInfo: { B: { id: 'B', submitted: '01-Sep-2026', responded: '09-Sep-2026' } } });
    expect(seen.B!.versionInfo!.B!.ae).toBeUndefined();
  });
});

describe('flags and the To EIC list', () => {
  it('keeps the panel\'s flags per journal, drops old mistakes, and says when nothing changed', () => {
    const a = mergeFlags({ abcj: { 'x.gif': 'kept' } }, 'xyzj', { 'red.gif': 'one' })!;
    expect(mergeFlags(a, 'xyzj', { 'red.gif': 'one' })).toBeNull();
    expect(mergeFlags(a, 'xyzj', { 'red.gif': 'one', 'blue.gif': 'two' })).toEqual({ abcj: { 'x.gif': 'kept' }, xyzj: { 'red.gif': 'one', 'blue.gif': 'two' } });
    // A name or a manuscript ID learned by 0.0.78 goes.
    const bad = { xyzj: { 'red.gif': 'one', 'person.gif': 'Example, Pat', 'arrow.gif': 'XYZJ-26-08-9001.R1' } };
    expect(mergeFlags(bad, 'xyzj', { 'red.gif': 'one' })).toEqual({ xyzj: { 'red.gif': 'one' } });
  });

  it('keeps the first date seen, replaces a changed choice, removes on request', () => {
    const item = { id: 'B', baseId: 'B', site: 'xyzj', recommendation: 'Reject', seen: '2026-11-19' };
    const a = applyEic({}, item)!;
    expect(applyEic(a, { ...item, seen: '2026-11-20' })).toBeNull();
    expect(applyEic(a, { ...item, recommendation: 'Accept', seen: '2026-11-20' })!.B).toMatchObject({ recommendation: 'Accept', seen: '2026-11-19' });
    expect(applyEic(a, undefined, 'B')).toEqual({});
    expect(applyEic(a, undefined, 'other')).toBeNull();
  });
});
