// The team database (lib/team.ts) with made-up people: checking files,
// placements and section labels, the roster derived for the matrix, a team
// made from an older roster, and removing a person everywhere.
import { describe, expect, it } from 'vitest';
import { emptyTeam, newId, parseTeam, placementOf, removePerson, removeSection, removeSectionText, sectionToColumn, sectionToColumnText, rosterFromTeam, sectionLabel, teamFromRoster, unassignedAes, unplaced, type Team, type TeamPerson } from '../lib/team';
import type { Roster } from '../lib/roster';

const person = (id: string, given: string, family: string, more: Partial<TeamPerson> = {}): TeamPerson => ({ id, given, family, affiliations: [], expertise: '', links: [], ...more });

const team = (): Team => ({
  ...emptyTeam('Test'),
  people: [
    person('p0', 'Alex', 'Adams', { email: 'alex@example.org', links: [{ label: 'Homepage', url: 'https://example.org/alex' }, { label: 'Lab', url: 'https://example.org/lab' }] }),
    person('p1', 'Casey', 'Chen'),
    person('p2', 'Blair', 'Brown', { ae: true }),
    person('p3', 'Emery', 'Evans', { ae: true }),
    person('p4', 'Robin', 'Writer'),
    person('p5', 'Sam', 'Spare'),
    person('p6', 'Co-Chairs', 'Shared', { shared: true }),
  ],
  leaders: [{ person: 'p0', role: 'co-chair' }],
  sections: [{ id: 's1', name: 'Example Section', heads: ['p1'], aes: ['p2'] }, { id: 's2', name: 'Other Section', heads: [], aes: ['p2'] }],
  columns: [{ id: 'c1', name: 'Example Column', section: 's1', columnists: ['p4'] }, { id: 'c2', name: 'Loose Column', columnists: [] }],
});

describe('team database', () => {
  it('reads its own files back and rejects bad ones', () => {
    const t = team();
    expect(parseTeam(JSON.parse(JSON.stringify(t)))).toEqual(t);
    expect(() => parseTeam({ format: 'electric-mc-roster' })).toThrow(/not an Electric MC team/);
    expect(() => parseTeam({ ...t, sections: [{ id: 's9', name: 'X', heads: ['nobody'], aes: [] }] })).toThrow(/isn't in people/);
    expect(() => parseTeam({ ...t, people: [...t.people, person('p0', 'Dup', 'Licate')] })).toThrow(/appears twice/);
    expect(() => parseTeam({ ...t, people: [person('p9', 'A', 'B', { email: 'two@example.org, three@example.org' })] })).toThrow(/email/);
    expect(() => parseTeam({ ...t, people: [person('p9', 'A', 'B', { links: [{ label: 'x', url: 'javascript:alert(1)' }] })] })).toThrow(/http/);
  });

  it('places people and labels them with every section', () => {
    const t = team();
    expect(placementOf(t, 'p2').aeIn.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(sectionLabel(t, 'p2')).toBe('Example Section / Other Section');
    expect(sectionLabel(t, 'p4')).toBe('Example Column');
    expect(sectionLabel(t, 'p0')).toBe('Co-Chair');
    expect(unassignedAes(t).map((p) => p.id)).toEqual(['p3']);
    expect(unplaced(t).map((p) => p.id)).toEqual(['p5', 'p6']);
  });

  it('derives the roster the matrix reads', () => {
    const r = rosterFromTeam(team());
    const by = (id: string) => r.people.find((p) => p.id === id)!;
    expect(by('p0')).toMatchObject({ group: 'leadership', roles: ['Test Co-Chair'], homepage: 'https://example.org/alex', email: 'alex@example.org' });
    expect(by('p0').links).toHaveLength(2);
    expect(by('p1')).toMatchObject({ group: 'column_heads', roles: ['Example Section Head'], assignable: true });
    expect(by('p2')).toMatchObject({ group: 'associate_editors', roles: ['Example Section Associate Editor', 'Other Section Associate Editor'], assignable: true });
    expect(by('p4')).toMatchObject({ group: 'columnists', roles: ['Example Column Columnist'], assignable: false });
  });

  it('makes a team from an older roster', () => {
    const roster: Roster = {
      format: 'electric-mc-roster', version: 1, section: 'Test', researchedOn: '2026-01-01', exportedAt: '2026-01-01T00:00:00Z',
      people: [
        { id: 'a', name: 'Pat Editor', group: 'leadership', roles: ['Test Co-Chair'], assignable: false, coheads: [], affiliations: [], expertise: '', initials: 'PE' },
        { id: 'b', name: 'Lee Head', group: 'column_heads', roles: ['Example Column Head', 'Example Columnist', 'Associate Editor'], assignable: true, coheads: [], affiliations: [], expertise: '', homepage: 'https://example.org/lee', initials: 'LH' },
        { id: 'c', name: 'Kim Ae', group: 'associate_editors', roles: ['Associate Editor'], assignable: true, coheads: [], affiliations: [], expertise: '', initials: 'KA' },
        { id: 'd', name: 'Jo Writer', group: 'columnists', roles: ['Loose Columnist'], assignable: false, coheads: [], affiliations: [], expertise: '', initials: 'JW' },
      ],
    };
    const t = parseTeam(teamFromRoster(roster));
    expect(t.leaders).toEqual([{ person: 'a', role: 'co-chair' }]);
    expect(t.sections).toEqual([{ id: 's-example', name: 'Example', heads: ['b'], aes: [] }]);
    expect(t.columns.map((c) => [c.name, c.section])).toEqual([['Example', 's-example'], ['Loose', undefined]]);
    expect(t.people.find((p) => p.id === 'b')).toMatchObject({ given: 'Lee', family: 'Head', ae: true, links: [{ label: 'Homepage', url: 'https://example.org/lee' }] });
    expect(unassignedAes(t).map((p) => p.id)).toEqual(['c']);
  });

  it('removes a person everywhere, and makes fresh ids', () => {
    const t = removePerson(team(), 'p2');
    expect(t.sections.flatMap((s) => s.aes)).toEqual([]);
    expect(() => parseTeam(t)).not.toThrow();
    expect(newId('p', 'Casey Chen', ['p-casey-chen'])).toBe('p-casey-chen-2');
    expect(newId('s', 'Économie & Société', [])).toBe('s-economie-societe');
  });
});

describe('removing a section', () => {
  // A section whose head is on no other part of the tree, like a column set up as a section by mistake.
  const withLoneSection = (): Team => {
    const t = team();
    return { ...t, sections: [...t.sections, { id: 's3', name: 'Bits', heads: ['p5'], aes: ['p3'] }], columns: [...t.columns, { id: 'c3', name: 'Inner', section: 's3', columnists: [] }] };
  };

  it('keeps its head and AEs on the tree, reporting to the co-chairs, and moves its columns', () => {
    const t = removeSection(withLoneSection(), 's3');
    expect(t.sections.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(unplaced(t).map((p) => p.id)).not.toContain('p5');
    expect(unassignedAes(t).map((p) => p.id).sort()).toEqual(['p3', 'p5']);
    expect(t.columns.find((c) => c.id === 'c3')?.section).toBeUndefined();
    expect(t.columns.find((c) => c.id === 'c1')?.section).toBe('s1');
  });

  it('leaves alone people who have another place', () => {
    const t = removeSection(team(), 's1');
    expect(t.people.find((p) => p.id === 'p1')?.ae).toBe(true); // head only here
    expect(placementOf(t, 'p2').aeIn.map((s) => s.id)).toEqual(['s2']);
    expect(removeSectionText(team(), 's1')).toContain('Blair Brown keeps their other places');
  });

  it('says exactly what happens, and points to making it a column', () => {
    const text = removeSectionText(withLoneSection(), 's3');
    expect(text).toContain('Remove the Bits section?');
    expect(text).toContain('Sam Spare (its head) will be in "AEs in no section", reporting to the co-chairs.');
    expect(text).toContain('Emery Evans (its AE) will be in "AEs in no section".');
    expect(text).toContain('Its column Inner will report to the co-chairs.');
    expect(text).toContain('"Make it a column"');
    expect(removeSectionText({ ...team(), sections: [{ id: 'e', name: 'Empty', heads: [], aes: [] }] }, 'e')).toContain('no heads, AEs or columns');
  });

  it('turns a section into a column of the same name with its heads as columnists', () => {
    const t = sectionToColumn(withLoneSection(), 's3');
    expect(t.sections.some((s) => s.id === 's3')).toBe(false);
    const col = t.columns.find((c) => c.name === 'Bits')!;
    expect(col).toMatchObject({ columnists: ['p5'] });
    expect(col.section).toBeUndefined();
    expect(t.people.find((p) => p.id === 'p5')?.ae).toBeUndefined();
    expect(unplaced(t).map((p) => p.id)).not.toContain('p5');
    expect(unassignedAes(t).map((p) => p.id)).toContain('p3');
    expect(sectionToColumnText(withLoneSection(), 's3')).toContain('Sam Spare will be its columnist.');
    expect(sectionToColumn(t, 'nope')).toBe(t);
  });
});

describe('saving a team file', () => {
  it('names the file after the team and writes a file that reads back', async () => {
    const { saveTeamFile, teamFileName } = await import('../lib/teamStore');
    expect(teamFileName({ ...team(), name: 'Opinions & More' })).toBe('team-opinions-more.json');
    expect(teamFileName({ ...team(), name: '' })).toBe('team-team.json');
    let blob: Blob | undefined;
    const clicked: string[] = [];
    const urls = { createObjectURL: (b: Blob) => ((blob = b), 'blob:x'), revokeObjectURL: () => {} };
    const doc = { createElement: () => ({ set href(_v: string) {}, set download(v: string) { clicked.push(v); }, click: () => clicked.push('click') }) } as unknown as Document;
    const was = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    Object.assign(URL, urls);
    const t = team();
    try {
      saveTeamFile(t, doc);
    } finally {
      Object.assign(URL, { createObjectURL: was.create, revokeObjectURL: was.revoke });
    }
    expect(clicked).toEqual(['team-test.json', 'click']);
    expect(parseTeam(JSON.parse(await blob!.text()))).toEqual(t);
  });
});
