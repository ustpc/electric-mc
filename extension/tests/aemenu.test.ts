// @vitest-environment jsdom
// The AE-assignment menu (lib/aemenu.ts), on a synthetic MC pull-down and a
// synthetic team (lib/team.ts) with made-up editors. Checks the order, the
// dividers, the labels and styles, that values, the selection and the load
// counts survive, that a second run changes nothing, and that clearing puts
// MC's menu back exactly.
import { describe, expect, it } from 'vitest';
import { applyAeMenu, clearAeMenu, defaultAeMenu, groupCounts, labelFor, parseAeMenu, sameName, type AeMenuConfig } from '../lib/aemenu';
import { readAeLoad } from '../lib/aeload';
import { emptyTeam, type Team, type TeamPerson } from '../lib/team';
import shipped from '../config/ae-menu.json';

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

const person = (id: string, given: string, family: string, more: Partial<TeamPerson> = {}): TeamPerson => ({ id, given, family, affiliations: [], expertise: '', links: [], ...more });

// Adams co-chairs; Chen heads Example Column, Ford heads Another Column and
// is an AE in Example Column; Brown is an AE in Example Column; Evans is an
// AE in no section; Diaz isn't on the team.
const team: Team = {
  ...emptyTeam('Test'),
  people: [person('p0', 'Alex', 'Adams'), person('p1', 'Casey', 'Chen'), person('p2', 'Finley', 'Ford'), person('p3', 'Blair', 'Brown', { ae: true }), person('p4', 'Emery', 'Evans', { ae: true })],
  leaders: [{ person: 'p0', role: 'co-chair' }],
  sections: [
    { id: 's1', name: 'Example Column', heads: ['p1'], aes: ['p3', 'p2'] },
    { id: 's2', name: 'Another Column', heads: ['p2'], aes: [] },
  ],
};

const plain = (): AeMenuConfig => ({ ...defaultAeMenu(), label: '' });
const texts = (s: HTMLSelectElement) => Array.from(s.options).map((o) => o.text);
const shape = (s: HTMLSelectElement) =>
  Array.from(s.children).map((c) => (c.tagName === 'OPTGROUP' ? `[${(c as HTMLOptGroupElement).label}] ${Array.from(c.children).map((o) => (o as HTMLOptionElement).value).join(',')}` : (c as HTMLOptionElement).value || '(placeholder)'));

describe('AE menu', () => {
  it('groups section heads, then AEs, then everyone else, under dividers', () => {
    const s = page();
    expect(applyAeMenu(document, plain(), team)).toBe(true);
    expect(shape(s)).toEqual(['(placeholder)', '[Section heads] 103,106', '[Opinions AEs] 102,105', '[Other AEs] 101,104']);
    // Values, text and the selection are MC's.
    expect(s.value).toBe('104');
    expect(texts(s).slice(1).sort()).toEqual(EDITORS.map(([, t]) => t).sort());
    const chen = s.querySelector<HTMLOptionElement>('option[value="103"]')!;
    expect(chen.style.color).toBe('rgb(122, 62, 0)');
    expect(chen.style.fontWeight).toBe('700');
    expect(document.getElementById('emc-aemenu-style')!.textContent).toContain('appearance: base-select');
  });

  it('labels team members with all their sections, keeps MC\'s count, and still reads MC\'s names and counts', () => {
    const s = page('106');
    applyAeMenu(document, defaultAeMenu(), team);
    const text = (v: string) => s.querySelector<HTMLOptionElement>(`option[value="${v}"]`)!.text;
    expect(text('103')).toBe('Example Column - Casey Chen (5)');
    expect(text('106')).toBe('Another Column / Example Column - Finley Ford (4)');
    expect(text('101')).toBe('Co-Chair - Alex Adams (2)');
    expect(text('105')).toBe('Emery Evans (3)');
    expect(text('104')).toBe('Diaz, Drew (1)');
    expect(s.value).toBe('106');
    expect(readAeLoad(document)!.find((e) => e.name === 'Chen, Casey')?.count).toBe(5);
    // Idempotent with labels too.
    const seen: MutationRecord[] = [];
    const ob = new MutationObserver((r) => seen.push(...r));
    ob.observe(s, { childList: true, subtree: true, characterData: true });
    applyAeMenu(document, defaultAeMenu(), team);
    seen.push(...ob.takeRecords());
    ob.disconnect();
    expect(seen).toHaveLength(0);
    clearAeMenu(document);
    expect(texts(s)).toEqual(['Select...', ...EDITORS.map(([, t]) => t)]);
    expect(s.querySelector('[data-emc-text]')).toBeNull();
  });

  it('puts MC\'s menu back as it was, selection included', () => {
    const s = page('105');
    s.options[3]!.setAttribute('style', 'color: red');
    // Only the whitespace between MC's options may move.
    const html = () => s.outerHTML.replace(/>\s+</g, '><');
    const before = html();
    applyAeMenu(document, { ...defaultAeMenu(), fontSize: 15 }, team);
    expect(s.style.fontSize).toBe('15px');
    clearAeMenu(document);
    expect(html()).toBe(before);
    expect(s.value).toBe('105');
    expect(document.getElementById('emc-aemenu-style')).toBeNull();
  });

  it('takes some sections only, lets typed names win, and sorts by load', () => {
    const s = page();
    const base = plain();
    const c: AeMenuConfig = {
      ...base,
      sort: 'load',
      groups: [{ label: 'Mine', names: ['Drew Diaz'] }, { label: 'Leaders', take: ['leaders'] }, { label: 'Another', take: ['heads', 'aes'], sections: ['another column'] }, ...base.groups],
    };
    applyAeMenu(document, c, team);
    expect(shape(s)).toEqual(['(placeholder)', '[Mine] 104', '[Leaders] 101', '[Another] 106', '[Section heads] 103', '[Opinions AEs] 102,105']);
    expect(groupCounts(EDITORS.map(([, t]) => t.replace(/ \(\d+\)$/, '')), c, team)).toEqual([1, 1, 1, 1, 2, 0]);
  });

  it('keeps one plain list without a team', () => {
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
    expect(applyAeMenu(document, defaultAeMenu(), team)).toBe(false);
    expect(s.outerHTML).toBe(before);
  });

  it('ships a config that names no one, and reads configs from before the team database', () => {
    expect(JSON.stringify(shipped)).not.toMatch(/"names":\s*\[\s*"/);
    expect(parseAeMenu(JSON.parse(JSON.stringify(defaultAeMenu())))).toEqual(defaultAeMenu());
    const old = parseAeMenu({ ...defaultAeMenu(), groups: [{ label: 'A', fromTable: true, rosterGroup: 'column_heads' }, { label: 'B', rosterGroup: 'associate_editors' }] });
    expect(old.groups.map((g) => g.take)).toEqual([['heads'], ['aes']]);
  });

  it('checks configs before using them', () => {
    expect(() => parseAeMenu({ format: 'nope' })).toThrow(/not an Electric MC AE menu/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), groups: [{ label: 'X', color: 'red; background: url(x)' }] })).toThrow(/color/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), groups: [{ label: 'X', take: ['everyone'] }] })).toThrow(/take/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), fontSize: 99 })).toThrow(/fontSize/);
    expect(() => parseAeMenu({ ...defaultAeMenu(), fontFamily: 'x}{' })).toThrow(/fontFamily/);
  });

  it('fills labels and drops a separator a blank section would leave', () => {
    const p = { given: 'Pat', family: 'Editor', section: '' };
    expect(labelFor({ ...p, section: 'Example' }, 'Editor, Pat', '{section} - {given} {family}')).toBe('Example - Pat Editor');
    expect(labelFor(p, 'Editor, Pat', '{section} - {given} {family}')).toBe('Pat Editor');
    expect(labelFor(p, 'Editor, Pat', '{mc} [{nope}]')).toBe('Editor, Pat [{nope}]');
  });

  it('matches names written either way', () => {
    expect(sameName('Editor, Pat', 'Pat Editor')).toBe(true);
    expect(sameName('Editor, P.', 'Pat Editor')).toBe(true);
    expect(sameName('Editor, Pat', 'Robin Editor')).toBe(false);
    expect(sameName('Editor, Pat', 'Pat Reviewer')).toBe(false);
    expect(sameName('Van Reviewer, Robin', 'Robin Van Reviewer')).toBe(true);
    expect(sameName('Editor, Benjamin', 'Editor, R. Benjamin')).toBe(true);
    expect(sameName('Éditeur, Anne-Cécile', 'Editeur, Anne')).toBe(true);
  });
});
