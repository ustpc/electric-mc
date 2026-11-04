// @vitest-environment jsdom
// The AE-assignment menu regrouping (lib/aemenu.ts), on a synthetic MC
// pull-down with made-up editors. Checks the order, the dividers, the styles,
// that values and the selection survive, that a second run changes nothing,
// and that clearing puts MC's menu back exactly.
import { describe, expect, it } from 'vitest';
import { applyAeMenu, clearAeMenu, defaultAeMenu, groupCounts, parseAeMenu, sameName, type AeMenuConfig } from '../lib/aemenu';
import type { Roster, RosterPerson } from '../lib/roster';

const EDITORS: Array<[string, string]> = [
  ['101', 'Adams, Alex (2)'],
  ['102', 'Brown, Blair (0)'],
  ['103', 'Chen, Casey (5)'],
  ['104', 'Diaz, Drew (1)'],
  ['105', 'Evans, Emery (3)'],
  ['106', 'Fox, Finley (4)'],
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
    person('p2', 'Finley Fox', 'column_heads'),
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
    const c: AeMenuConfig = { ...defaultAeMenu(), sort: 'load', groups: [{ label: 'Mine', names: ['Alex Adams', 'Fox, F.'] }, ...defaultAeMenu().groups] };
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
});
