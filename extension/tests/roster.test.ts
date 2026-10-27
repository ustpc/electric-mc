// Loading the Opinions roster file. Made-up people only.
import { describe, expect, it } from 'vitest';
import { matchesSearch, parseRoster } from '../lib/roster';

const good = () => ({
  format: 'electric-mc-roster',
  version: 1,
  section: 'Opinions',
  researchedOn: '2026-10-12',
  mastheadSource: 'https://example.org/masthead',
  exportedAt: '2026-10-23T00:00:00Z',
  people: [
    {
      id: 'pat-editor', name: 'Pat Editor', group: 'associate_editors', roles: ['Associate Editor'], assignable: true,
      coheads: [], affiliations: ['Example University'], mastheadAffiliation: 'Example College', affiliationMismatch: true,
      expertise: 'Synthetic expertise in made-up topics', homepage: 'https://example.org/pat', email: 'pat@example.org',
      linkedin: null, acmDl: null, portrait: 'data:image/jpeg;base64,AAAA', initials: 'PE',
    },
  ],
});

describe('parseRoster', () => {
  it('loads a good file', () => {
    const r = parseRoster(good());
    expect(r.people[0]).toMatchObject({ id: 'pat-editor', assignable: true, affiliationMismatch: true, linkedin: undefined });
  });
  it('rejects other files', () => {
    expect(() => parseRoster({})).toThrow(/not an Electric MC roster/);
    expect(() => parseRoster({ ...good(), version: 2 })).toThrow(/newer/);
    expect(() => parseRoster({ ...good(), people: [] })).toThrow(/no people/);
  });
  it('rejects unsafe links and portraits', () => {
    const js = good();
    js.people[0]!.homepage = 'javascript:alert(1)';
    expect(() => parseRoster(js)).toThrow(/http/);
    const svg = good();
    svg.people[0]!.portrait = 'data:image/svg+xml;base64,AAAA';
    expect(() => parseRoster(svg)).toThrow(/JPEG or PNG/);
  });
  it('rejects unknown sections and repeated ids', () => {
    const g = good();
    g.people[0]!.group = 'reviewers';
    expect(() => parseRoster(g)).toThrow(/section/);
    const d = good();
    d.people.push({ ...d.people[0]! });
    expect(() => parseRoster(d)).toThrow(/twice/);
  });
});

describe('matchesSearch', () => {
  const p = parseRoster(good()).people[0]!;
  it('needs every word somewhere in the row, ignoring case and accents', () => {
    expect(matchesSearch(p, 'EXAMPLE synthetic')).toBe(true);
    expect(matchesSearch(p, 'éditor')).toBe(true);
    expect(matchesSearch(p, 'example unrelated')).toBe(false);
    expect(matchesSearch(p, '3 assigned', '3 assigned')).toBe(true);
  });
});
