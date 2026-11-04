// @vitest-environment jsdom
// The AE-assignment menu regrouping (lib/aemenu.ts), on a synthetic MC
// pull-down with made-up editors. Checks the order, the dividers, the styles,
// that values and the selection survive, that a second run changes nothing,
// and that clearing puts MC's menu back exactly.
import { describe, expect, it } from 'vitest';
import { applyAeMenu, clearAeMenu, defaultAeMenu, groupCounts, labelFor, parseAeMenu, parsePeopleTable, sameName, unmatchedPeople, type AeMenuConfig } from '../lib/aemenu';
import { readAeLoad } from '../lib/aeload';
import shipped from '../config/ae-menu.json';
import type { Roster, RosterPerson } from '../lib/roster';

const EDITORS: Array<[string, string]> = [
  ['101', 'Adams, Alex (2)'],
  ['102', 'Brown, Blair (0)'],
  ['103', 'Chen, Casey (5)'],
  ['104', 'Diaz, Drew (1)'],
  ['105', 'Evans, Emery (3)'],
  ['106', 'Ford, Finley (4)'],
];

function page(selected = '104'): HTMLSelectElement {
  document.head.innerHTML = '';
  document.body.innerHTML = `<table><tr><td>Assign Associate Editor</td><td><select id="ae" name="AE_SELECT">
    <option value="">Select...</option>
    ${EDITORS.map(([v, t]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${t}</option>`).join('')}
  </select></td></tr></table>`;
  return document.getElementById('ae') as HTMLSelectElement;
}

const person = (id: string, name: string, group: RosterPerson['group']): RosterPerson => ({
  id, name, group, roles: [], assignable: true, coheads: [], affiliations: [], expertise: '', initials: '',
});

const roster: Roster = {
  format: 'electric-mc-roster',
  version: 1,
  section: 'Test Section',
  researchedOn: '2026-01-01',
  exportedAt: '2026-01-01',
  people: [
    person('p1', 'Casey Chen', 'column_heads'),
    person('p2', 'Finley Ford', 'column_heads'),
    person('p3', 'Blair Brown', 'associate_editors'),
    person('p4', 'Emery Evans', 'associate_editors'),
  ],
};

const texts = (s: HTMLSelectElement) => Array.from(s.options).map((o) => o.text);
const shape = (s: HTMLSelectElement) =>
  Array.from(s.children).map((c) => (c.tagName === 'OPTGROUP' ? `[${(c as HTMLOptGroupElement).label}] ${Array.from(c.children).map((o) => (o as HTMLOptionElement).value).join(',')}` : (c as HTMLOptionElement).value || '(placeholder)'));

describe('AE menu', () => {
  it('groups column heads, then section AEs, then everyone else, under dividers', () => {
    const s = page();
    expect(applyAeMenu(document, defaultAeMenu(), roster)).toBe(true);
    expect(shape(s)).toEqual(['(placeholder)', '[Column heads] 103,106', '[Opinions AEs] 102,105', '[Other AEs] 101,104']);
    // Values, text and the selection are MC's.
    expect(s.value).toBe('104');
    expect(texts(s).slice(1).sort()).toEqual(EDITORS.map(([, t]) => t).sort());
    const chen = s.querySelector<HTMLOptionElement>('option[value="103"]')!;
    expect(chen.style.color).toBe('rgb(122, 62, 0)');
    expect(chen.style.fontWeight).toBe('700');
    expect(document.getElementById('emc-aemenu-style')!.textContent).toContain('appearance: base-select');
  });

  it('changes nothing the second time, so the page observer cannot loop', () => {
    const s = page();
    applyAeMenu(document, defaultAeMenu(), roster);
    const seen: MutationRecord[] = [];
    const ob = new MutationObserver((r) => seen.push(...r));
    ob.observe(s, { childList: true, subtree: true });
    applyAeMenu(document, defaultAeMenu(), roster);
    seen.push(...ob.takeRecords());
    ob.disconnect();
    expect(seen).toHaveLength(0);
  });

  it('puts MC\'s menu back as it was, selection included', () => {
    const s = page('105');
    s.options[3]!.setAttribute('style', 'color: red');
    // Only the whitespace between MC's options may move.
    const html = () => s.outerHTML.replace(/>\s+</g, '><');
    const before = html();
    applyAeMenu(document, { ...defaultAeMenu(), fontSize: 15 }, roster);
    expect(s.style.fontSize).toBe('15px');
    clearAeMenu(document);
    expect(html()).toBe(before);
    expect(s.value).toBe('105');
    expect(document.getElementById('emc-aemenu-style')).toBeNull();
  });

  it('lets typed names win over roster sections, and sorts by load', () => {
    const s = page();
    const c: AeMenuConfig = { ...defaultAeMenu(), sort: 'load', groups: [{ label: 'Mine', names: ['Alex Adams', 'Ford, F.'] }, ...defaultAeMenu().groups] };
    applyAeMenu(document, c, roster);
    expect(shape(s)).toEqual(['(placeholder)', '[Mine] 101,106', '[Column heads] 103', '[Opinions AEs] 102,105', '[Other AEs] 104']);
    expect(groupCounts(EDITORS.map(([, t]) => t.replace(/ \(\d+\)$/, '')), c, roster)).toEqual([2, 1, 2, 1]);
  });

  it('keeps one plain list when no group matches anyone', () => {
    const s = page();
    applyAeMenu(document, defaultAeMenu(), null);
    expect(s.querySelector('optgroup')).toBeNull();
    expect(texts(s)).toEqual(['Select...', ...EDITORS.map(([, t]) => t)]);
  });

  it('leaves alone a select MC already divides', () => {
    const s = page();
    const og = document.createElement('optgroup');
    og.label = 'MC';
    og.appendChild(s.options[1]!);
    s.appendChild(og);
    const before = s.outerHTML;
    expect(applyAeMenu(document, defaultAeMenu(), roster)).toBe(false);
    expect(s.outerHTML).toBe(before);
  });

  it('checks configs before using them', () => {
    expect(parseAeMenu(JSON.parse(JSON.stringify(defaultAeMenu())))).toEqual(defaultAeMenu());
    expect(() => parseAeMenu({ format: 'nope' })).toThrow(/not an Electric MC AE menu/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), groups: [{ label: 'X', color: 'red; background: url(x)' }] })).toThrow(/color/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), groups: [{ label: 'X', rosterGroup: 'everyone' }] })).toThrow(/rosterGroup/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), fontSize: 99 })).toThrow(/fontSize/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), fontFamily: 'x}{' })).toThrow(/fontFamily/);
  });

  it('matches names written either way', () => {
    expect(sameName('Editor, Pat', 'Pat Editor')).toBe(true);
    expect(sameName('Editor, P.', 'Pat Editor')).toBe(true);
    expect(sameName('Editor, Pat', 'Robin Editor')).toBe(false);
    expect(sameName('Editor, Pat', 'Pat Reviewer')).toBe(false);
  });

  it('ships a blank table', () => {
    expect(shipped.people).toEqual([]);
    expect(defaultAeMenu().people).toEqual([]);
  });

  it('relabels table people, keeps MC\'s count, and still reads MC\'s names and counts', () => {
    const s = page('103');
    const c: AeMenuConfig = {
      ...defaultAeMenu(),
      people: [
        { given: 'Casey', family: 'Chen', section: 'Example Column' },
        { given: 'Drew', family: 'Diaz', section: 'Another Column', email: 'drew@example.org' },
      ],
    };
    applyAeMenu(document, c, roster);
    // Both table people are column heads now, ahead of the roster's.
    expect(shape(s)).toEqual(['(placeholder)', '[Column heads] 103,104,106', '[Opinions AEs] 102,105', '[Other AEs] 101']);
    expect(s.querySelector<HTMLOptionElement>('option[value="103"]')!.text).toBe('Example Column - Casey Chen (5)');
    expect(s.querySelector<HTMLOptionElement>('option[value="106"]')!.text).toBe('Ford, Finley (4)');
    expect(s.value).toBe('103');
    expect(readAeLoad(document)!.find((e) => e.name === 'Chen, Casey')?.count).toBe(5);
    // Idempotent with labels too.
    const seen: MutationRecord[] = [];
    const ob = new MutationObserver((r) => seen.push(...r));
    ob.observe(s, { childList: true, subtree: true, characterData: true });
    applyAeMenu(document, c, roster);
    seen.push(...ob.takeRecords());
    ob.disconnect();
    expect(seen).toHaveLength(0);
    clearAeMenu(document);
    expect(texts(s)).toEqual(['Select...', ...EDITORS.map(([, t]) => t)]);
    expect(s.querySelector('[data-emc-text]')).toBeNull();
  });

  it('can take only some table sections into a group', () => {
    const s = page();
    const base = defaultAeMenu();
    const c: AeMenuConfig = {
      ...base,
      label: '',
      people: [{ given: 'Alex', family: 'Adams', section: 'Co-Chair' }, { given: 'Drew', family: 'Diaz', section: 'Privacy' }],
      groups: [{ label: 'Chairs', fromTable: ['co-chair'] }, ...base.groups],
    };
    applyAeMenu(document, c, null);
    // Diaz is in the table, so "Column heads" (everyone in the table) takes them.
    expect(shape(s)).toEqual(['(placeholder)', '[Chairs] 101', '[Column heads] 104', '[Other AEs] 102,103,105,106']);
    expect(s.querySelector<HTMLOptionElement>('option[value="101"]')!.text).toBe('Adams, Alex (2)');
  });

  it('fills labels and drops a separator a blank section would leave', () => {
    const p = { given: 'Pat', family: 'Editor', section: '' };
    expect(labelFor({ ...p, section: 'Example' }, 'Editor, Pat', '{section} - {given} {family}')).toBe('Example - Pat Editor');
    expect(labelFor(p, 'Editor, Pat', '{section} - {given} {family}')).toBe('Pat Editor');
    expect(labelFor(p, 'Editor, Pat', '{mc} [{nope}]')).toBe('Editor, Pat [{nope}]');
  });

  it('reads pasted spreadsheet rows', () => {
    const rows = parsePeopleTable('First (Given) Name\tLast (Family) Name\tSection\tEmail Address\nPat\tEditor\tExample Column\tpat@example.org\nRobin\tVan Reviewer\tOther\t\n\nbad-line\n');
    expect(rows).toEqual([
      { given: 'Pat', family: 'Editor', section: 'Example Column', email: 'pat@example.org' },
      { given: 'Robin', family: 'Van Reviewer', section: 'Other' },
    ]);
    expect(parsePeopleTable('Pat, Editor, Example')).toEqual([{ given: 'Pat', family: 'Editor', section: 'Example' }]);
  });

  it('matches multi-word and accented names, and lists table people MC lacks', () => {
    expect(sameName('Van Reviewer, Robin', 'Robin Van Reviewer')).toBe(true);
    expect(sameName('Editor, Benjamin', 'Editor, R. Benjamin')).toBe(true);
    expect(sameName('Éditeur, Anne-Cécile', 'Editeur, Anne')).toBe(true);
    const people = [{ given: 'Pat', family: 'Editor', section: '' }, { given: 'Sam', family: 'Missing', section: '' }];
    expect(unmatchedPeople(['Editor, Pat'], people)).toEqual([people[1]]);
  });

  it('rejects bad table rows', () => {
    expect(() => parseAeMenu({ ...defaultAeMenu(), people: [{ given: '', family: 'X', section: '' }] })).toThrow(/given/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), people: [{ given: 'A', family: 'B', section: '', email: 'nope' }] })).toThrow(/email/);
  });
});
