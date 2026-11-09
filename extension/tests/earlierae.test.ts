import { describe, expect, it } from 'vitest';
import { earlierIds, markAeList } from '../lib/earlierae';
import { aeMenuStatus, plainAeMenu } from '../lib/aemenu';

const PAGE = `<table><tr><td>Associate Editor List</td></tr>
  <tr><td>Order</td><td>Name</td><td>Status</td><td>History</td><td>Remove</td></tr>
  <tr id="pick"><td colspan="5">Pick from a list: <select id="ae">
    <option value="">Select an AE (# Current Assignments)</option>
    <option value="1">Adams, Alex (0)</option>
    <option value="2">Brown, Bea (2)</option>
    <option value="3">Pat Editor, Sam Editor (6)</option>
    <option value="4">Zed, Zoe (1)</option>
  </select></td></tr></table>`;

describe('earlier AEs on the Assign AE page', () => {
  it('lists the earlier versions newest first', () => {
    expect(earlierIds('XYZJ-2026-0001', 1)).toEqual(['XYZJ-2026-0001']);
    expect(earlierIds('XYZJ-2026-0001', 2)).toEqual(['XYZJ-2026-0001.R1', 'XYZJ-2026-0001']);
  });

  it('adds a row to the Associate Editor List above the pull-down, once', () => {
    document.body.innerHTML = PAGE;
    const list = [{ id: 'XYZJ-2026-0001', ae: 'Pat Editor, Sam Editor' }];
    expect(markAeList(document, list)).toBe(true);
    expect(markAeList(document, list)).toBe(true);
    const rows = document.querySelectorAll('[data-electric-mc="earlier-ae"]');
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent).toBe('Original Associate Editor: Pat Editor, Sam Editor');
    expect(rows[0]!.nextElementSibling!.id).toBe('pick');
    expect((rows[0]!.querySelector('td') as HTMLTableCellElement).colSpan).toBe(5);
    markAeList(document, []);
    expect(document.querySelector('[data-electric-mc="earlier-ae"]')).toBeNull();
  });

  it('says when an earlier AE was never recorded', () => {
    document.body.innerHTML = PAGE;
    markAeList(document, [{ id: 'XYZJ-2026-0001.R1' }, { id: 'XYZJ-2026-0001', ae: 'Brown, Bea' }]);
    expect(document.querySelector('[data-electric-mc="earlier-ae"]')!.textContent).toBe(
      'R1 Associate Editor: not recorded yet (open that version once)Original Associate Editor: Brown, Bea',
    );
  });

  it('puts the earlier AE at the top of the pull-down, keeping the rest in MC order', () => {
    document.body.innerHTML = PAGE;
    const sel = document.getElementById('ae') as HTMLSelectElement;
    expect(aeMenuStatus(document, plainAeMenu(), null, { label: 'Original AE', names: ['Pat Editor, Sam Editor'] })).toBe('styled');
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['', '3', '1', '2', '4']);
    expect(sel.querySelector('optgroup')!.label).toBe('Original AE');
    expect(sel.value).toBe('');
  });
});

describe('a role account pinned to the top', () => {
  it('matches "Co-Chair, Opinions" by its MC name, shows the person, and puts it first', async () => {
    const { parseTeam } = await import('../lib/team');
    const { defaultAeMenu, personFor } = await import('../lib/aemenu');
    const team = parseTeam({
      format: 'electric-mc-team', version: 1, name: 'Opinions', updatedAt: '', leaders: [{ person: 'pat', role: 'co-chair' }], sections: [], columns: [],
      people: [
        { id: 'pat', given: 'Pat', family: 'Editor', affiliations: [], expertise: '', links: [] },
        { id: 'role', given: 'Pat', family: 'Editor', mcName: 'Co-Chair, Opinions', menuTitle: 'Opinion Co-Chair', menuTop: true, shared: true, affiliations: [], expertise: '', links: [] },
      ],
    });
    expect(personFor('Editor, Pat', team)?.id).toBe('pat');
    expect(personFor('Co-Chair, Opinions', team)?.id).toBe('role');
    document.body.innerHTML = `<table><tr><td>Associate Editor List</td></tr><tr><td>Pick from a list: <select id="ae">
      <option value="">Select an AE (# Current Assignments)</option><option value="1">Adams, Alex (0)</option>
      <option value="2">Co-Chair, Opinions (4)</option><option value="3">Editor, Pat (0)</option></select></td></tr></table>`;
    const sel = document.getElementById('ae') as HTMLSelectElement;
    expect(aeMenuStatus(document, defaultAeMenu(), team)).toBe('styled');
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['', '2', '1', '3']);
    expect(sel.options[1]!.text).toBe('Opinion Co-Chair - Pat Editor (4)');
    expect(sel.querySelector('optgroup')!.label).toBe('Opinion Co-Chair');
    expect(sel.options[3]!.text).toBe('Co-Chair - Pat Editor (0)');
  });
});
