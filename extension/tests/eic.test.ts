// @vitest-environment jsdom
// Roles learned from the page, recommendations to the EIC, the grid notes,
// and clickable IDs. Synthetic markup and names only.
import { describe, expect, it } from 'vitest';
import { addRoles, roleLabels, rolesIn } from '../lib/roles';
import { annotateEicRows, eicSummary, myRecommendation, readRecommendations, recommendationsBox, type EicItem } from '../lib/recommend';
import { linkIds, unlinkIds } from '../lib/idlink';

describe('roles', () => {
  it('reads roles from the switcher, its menu and the breadcrumb', () => {
    document.body.innerHTML = `<ul><li class="dropdown"><a class="dropdown-toggle">Opinions Co-Chair</a>
      <ul class="dropdown-menu"><li><a>Opinions Co-Chair</a></li><li><a>Associate Editor</a></li><li><a>Reviewer</a></li><li><a>Author</a></li></ul></li>
      <li class="dropdown"><a class="dropdown-toggle">Manage</a><ul class="dropdown-menu"><li><a>Reviewer Locator</a></li></ul></li></ul>`;
    const labels = roleLabels(document, ['Co-Chair Dashboard', 'Awaiting AE Assignment']);
    expect(rolesIn(labels).sort()).toEqual(['ae', 'author', 'coChair', 'reviewer']);
  });
  it('knows the EIC', () => {
    expect(rolesIn(['Editor-in-Chief Center'])).toEqual(['eic']);
  });
  it('never forgets a role and keeps the first date', () => {
    const a = addRoles({}, ['coChair'], '2026-10-01');
    const b = addRoles(a, ['author', 'coChair'], '2026-10-24');
    expect(b).toEqual({ coChair: '2026-10-01', author: '2026-10-24' });
  });
});

const BOX = `<table><tr><td class="hdr">Recommendations</td></tr><tr><td>
  <table><tr><td><img src="x.gif"></td><td><a href="#">Chair, Pat</a></td></tr></table>
  <ul><li>Reject &amp; Resubmit</li><li><a href="#">view recommendation</a></li><li><a href="#">rescind</a></li></ul>
  <table><tr><td><img src="x.gif"></td><td><a href="#">Editor, Robin</a></td></tr></table>
  <ul><li>Minor Revision</li><li><a href="#">view recommendation</a></li></ul>
</td></tr></table>`;

describe('recommendations', () => {
  it('reads each recommendation and who can rescind it', () => {
    document.body.innerHTML = `<p>Note: awaiting reviewer assignment</p>${BOX}`;
    const recs = readRecommendations(recommendationsBox(document)!);
    expect(recs).toEqual([
      { by: 'Chair, Pat', recommendation: 'Reject & Resubmit', canRescind: true },
      { by: 'Editor, Robin', recommendation: 'Minor Revision', canRescind: false },
    ]);
    expect(myRecommendation(recs)?.by).toBe('Chair, Pat');
  });
  it('falls back to the co-chair name when there is no rescind link', () => {
    document.body.innerHTML = BOX.replace('<li><a href="#">rescind</a></li>', '');
    const recs = readRecommendations(recommendationsBox(document)!);
    expect(myRecommendation(recs)).toBeNull();
    expect(myRecommendation(recs, 'Chair, Pat')?.recommendation).toBe('Reject & Resubmit');
  });
  it('finds no box on a page without one', () => {
    document.body.innerHTML = '<p>Reviewers: none</p>';
    expect(recommendationsBox(document)).toBeNull();
  });
});

const GRID = `<table>
  <tr><th>Manuscript ID</th><th>Manuscript Title</th><th>Status</th><th>Take Action</th></tr>
  <tr><td>XYZJ-26-09-9011</td><td>A Synthetic Paper</td><td>AE: Not Assigned</td><td><a href="#" id="go1"><img src="check.gif"></a></td></tr>
  <tr><td>Opinion</td><td>Author, Alex</td></tr>
  <tr><td>XYZJ-26-10-9012</td><td>Another Synthetic Paper</td><td>AE: Not Assigned</td><td><a href="#" id="go2"><img src="check.gif"></a></td></tr>
</table>`;

const ITEM: EicItem = { id: 'XYZJ-26-09-9011', baseId: 'XYZJ-26-09-9011', site: 'xyzj', title: 'A Synthetic Paper', recommendation: 'Reject', seen: '2026-10-23' };

describe('queue grid', () => {
  it('notes a recommended manuscript in its Status cell', () => {
    document.body.innerHTML = GRID;
    expect(annotateEicRows(document, { [ITEM.id]: ITEM })).toBe(1);
    const note = document.querySelector('[data-electric-mc="eic-note"]')!;
    expect(note.textContent).toBe('E-MC: you recommended Reject (seen 2026-10-23); waiting for the EIC');
    expect(note.closest('td')!.textContent).toContain('AE: Not Assigned');
    // Run again: still one note.
    annotateEicRows(document, { [ITEM.id]: ITEM });
    expect(document.querySelectorAll('[data-electric-mc="eic-note"]')).toHaveLength(1);
  });

  it('makes each ID press its own row\'s Take Action', () => {
    document.body.innerHTML = GRID;
    const clicks: string[] = [];
    document.querySelectorAll('a[id^=go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); clicks.push(a.id); }));
    expect(linkIds(document)).toBe(2);
    expect(linkIds(document)).toBe(0);
    const links = document.querySelectorAll<HTMLAnchorElement>('a[data-electric-mc="id-link"]');
    expect(links[1]!.textContent).toBe('XYZJ-26-10-9012');
    links[1]!.click();
    expect(clicks).toEqual(['go2']);
    unlinkIds(document);
    expect(document.querySelector('a[data-electric-mc="id-link"]')).toBeNull();
    expect(document.querySelector('td')!.textContent).toBe('XYZJ-26-09-9011');
  });

  it('summarises the list for the EIC', () => {
    expect(eicSummary([ITEM])).toBe('Recommendations waiting for your decision (1):\n\nXYZJ-26-09-9011 "A Synthetic Paper": Reject (since 2026-10-23)');
  });
});

describe('ID links look like E-MC additions', () => {
  it('are bold brown', () => {
    document.body.innerHTML = GRID;
    linkIds(document);
    const a = document.querySelector<HTMLAnchorElement>('a[data-electric-mc="id-link"]')!;
    expect(a.style.color).toMatch(/rgb\(180, 83, 9\)|#b45309/i);
    expect(a.style.fontWeight).toBe('700');
  });
});
