// @vitest-environment jsdom
// AE workloads from MC's assignment pull-down, and matching MC's names to the
// roster. Synthetic markup and made-up names only.
import { describe, expect, it } from 'vitest';
import { journalKey, matchPerson, nameParts, parseOption, readAeLoad } from '../lib/aeload';
import { joinLoads, latestJournal } from '../lib/matrix';
import type { RosterPerson } from '../lib/roster';

function doc(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
}

const PULLDOWN = `
<table>
  <tr><td class="hdr">Assign Associate Editor</td></tr>
  <tr><td>Associate Editor:</td><td><select name="XIK_AE_ID">
    <option value="">Select...</option>
    <option value="11">Editor, Pat (3)</option>
    <option value="12">Editor-Smith, Robin Q. (0)</option>
    <option value="13">Van Example, Sam (12)</option>
  </select></td></tr>
</table>`;

describe('parseOption', () => {
  it('reads a name and a count', () => {
    expect(parseOption('Editor, Pat (3)')).toEqual({ name: 'Editor, Pat', count: 3 });
    expect(parseOption('  Editor,  Pat   [4] ')).toEqual({ name: 'Editor, Pat', count: 4 });
    expect(parseOption('Editor, Pat - 5')).toEqual({ name: 'Editor, Pat', count: 5 });
    expect(parseOption('Editor, Pat (6 assigned)')).toEqual({ name: 'Editor, Pat', count: 6 });
  });
  it('ignores options without a count', () => {
    expect(parseOption('Editor, Pat')).toBeNull();
    expect(parseOption('Select...')).toBeNull();
  });
});

describe('readAeLoad', () => {
  it('reads the AE pull-down', () => {
    expect(readAeLoad(doc(PULLDOWN))).toEqual([
      { name: 'Editor, Pat', count: 3 },
      { name: 'Editor-Smith, Robin Q.', count: 0 },
      { name: 'Van Example, Sam', count: 12 },
    ]);
  });
  it('needs editor wording near the select', () => {
    expect(readAeLoad(doc(PULLDOWN.replace(/Assign Associate Editor|Associate Editor:/g, 'Pick one').replace('XIK_AE_ID', 'x')))).toBeNull();
  });
  it('skips reviewer pull-downs', () => {
    expect(readAeLoad(doc(PULLDOWN.replace(/Assign Associate Editor|Associate Editor:/g, 'Invite Reviewer').replace('XIK_AE_ID', 'x')))).toBeNull();
  });
  it('skips selects whose options mostly have no count', () => {
    const html = `<label for="s">Editor</label><select id="s"><option>Editor, Pat (3)</option><option>Editor, Robin</option><option>Editor, Sam</option></select>`;
    expect(readAeLoad(doc(html))).toBeNull();
  });
  it('ignores ordinary selects', () => {
    expect(readAeLoad(doc('<select><option>Manuscript ID</option><option>Title</option></select>'))).toBeNull();
  });
});

describe('journalKey', () => {
  it('keys by host and first path segment', () => {
    expect(journalKey('https://mc.manuscriptcentral.com/xyzj?NEXT_PAGE=1')).toBe('mc.manuscriptcentral.com/xyzj');
    expect(journalKey('not a url')).toBe('');
  });
});

const person = (id: string, name: string): RosterPerson => ({
  id, name, group: 'associate_editors', roles: [], assignable: true, coheads: [], affiliations: [], expertise: '', initials: '',
});
const PEOPLE = [
  person('pat', 'Pat A. Editor'),
  person('robin', 'Robin Q. Editor-Smith'),
  person('sam', 'Sam van Example'),
  person('jo', 'Jo Sample'),
  person('jamie', 'Jamie Sample'),
  person('ana', 'Ána Ñoño'),
];

describe('matchPerson', () => {
  it('splits MC names', () => {
    expect(nameParts('Van Example, Sam')).toEqual({ surname: ['van', 'example'], given: ['sam'] });
    expect(nameParts('Pat Editor')).toEqual({ surname: ['editor'], given: ['pat'] });
  });
  it('matches "Last, First" to "First M. Last"', () => {
    expect(matchPerson('Editor, Pat', PEOPLE)?.id).toBe('pat');
    expect(matchPerson('Editor-Smith, Robin Q.', PEOPLE)?.id).toBe('robin');
    expect(matchPerson('Van Example, Sam', PEOPLE)?.id).toBe('sam');
    expect(matchPerson('Nono, Ana', PEOPLE)?.id).toBe('ana');
  });
  it('tells people with one surname apart by first name or initial', () => {
    expect(matchPerson('Sample, Jo', PEOPLE)?.id).toBe('jo');
    expect(matchPerson('Sample, Jamie', PEOPLE)?.id).toBe('jamie');
    expect(matchPerson('Sample, Chris', PEOPLE)).toBeUndefined();
  });
  it('takes a lone surname match with another first name (a nickname)', () => {
    expect(matchPerson('Editor, Patty', PEOPLE)?.id).toBe('pat');
  });
  it('matches nobody for an unknown name', () => {
    expect(matchPerson('Nobody, Alex', PEOPLE)).toBeUndefined();
  });
});

describe('joinLoads', () => {
  it('puts counts on roster people and keeps the rest', () => {
    const j = joinLoads(PEOPLE, [
      { name: 'Editor, Pat', count: 3 },
      { name: 'Editor, Pat A.', count: 1 },
      { name: 'Nobody, Alex', count: 2 },
    ]);
    expect(j.counts.get('pat')).toBe(4);
    expect(j.counts.has('robin')).toBe(false);
    expect(j.unmatched).toEqual([{ name: 'Nobody, Alex', count: 2 }]);
  });
  it('shows the most recently read journal first', () => {
    expect(latestJournal({
      a: { at: '2026-10-01T00:00:00Z', journal: 'a', entries: [] },
      b: { at: '2026-10-02T00:00:00Z', journal: 'b', entries: [] },
    })).toBe('b');
    expect(latestJournal({})).toBeUndefined();
  });
});
