import { describe, expect, it } from 'vitest';
import { assignmentsByPerson } from '../lib/matrix';
import type { SeenManuscript } from '../lib/messages';

const people = [
  { id: 'p-pat', name: 'Pat Example' },
  { id: 'p-sam', name: 'Sam Sample' },
];

function ms(baseId: string, latestId: string, ae: Record<string, string>, status?: string): SeenManuscript {
  return { baseId, latestId, site: null, title: `This is a test! ${latestId}`, status, aeByVersion: ae, firstSeen: '', lastSeen: '', seenOn: [] };
}

describe('assignments by person', () => {
  it('lists each open manuscript under the AE of its newest version', () => {
    const seen = {
      a: ms('CACM-24-04-1000', 'CACM-24-04-1000.R2', { 'CACM-24-04-1000.R1': 'Example, Pat' }),
      b: ms('CACM-24-04-1001', 'CACM-24-04-1001', { 'CACM-24-04-1001': 'Sample, Sam' }, 'Awaiting AE Recommendation'),
      c: ms('CACM-24-04-1002', 'CACM-24-04-1002.R1', { 'CACM-24-04-1002': 'Example, Pat', 'CACM-24-04-1002.R1': 'Sample, Sam' }),
      d: ms('CACM-24-04-1003', 'CACM-24-04-1003', { 'CACM-24-04-1003': 'Example, Pat' }, 'Reject'),
      e: ms('CACM-24-04-1004', 'CACM-24-04-1004', { 'CACM-24-04-1004': 'Nobody, Known' }),
    };
    const got = assignmentsByPerson(people, seen);
    expect(got.get('p-pat')?.map((a) => a.id)).toEqual(['CACM-24-04-1000.R2']);
    expect(got.get('p-sam')?.map((a) => a.id)).toEqual(['CACM-24-04-1001', 'CACM-24-04-1002.R1']);
    expect(got.get('p-sam')?.[0]?.title).toBe('This is a test! CACM-24-04-1001');
  });
});
