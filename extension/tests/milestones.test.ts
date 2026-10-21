// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { addMilestoneRows, daysBetween, decisionLettersIn, findAuditTrailLink, EMC_COLOR, findMilestonesRow, versionInfoFrom, versionName } from '../lib/milestones';

// Synthetic markup shaped like MC's details page (names are made up).
const MILESTONES = `
<div class="section"><div class="hdr">Peer Review Milestones</div>
<table class="milestones">
  <tr><td class="lbl">Date Submitted:</td><td class="val" colspan="3">13-Oct-2026</td></tr>
  <tr><td class="lbl">Admin:</td><td class="val"><a>Admin, Test</a> <a>AU</a> <a>REV</a></td><td class="lbl">Date to Admin:</td><td class="val">13-Oct-2026</td></tr>
  <tr><td class="lbl">Co-Chair:</td><td class="val"><a>Chair, Pat</a> <a>AU</a> <a>CC</a></td><td class="lbl">Date to Co-Chair:</td><td class="val">13-Oct-2026</td></tr>
</table></div>`;

const R1 = `
<div>CACM-26-03-1234.R1</div>
<div>Submitted: 01-Aug-2026; Last Updated: 02-Sep-2026</div>
<div>AE: <a>Editor, Sam</a></div><div>CC: <a>Chair, Pat</a></div>
${MILESTONES.replace('13-Oct-2026', '01-Aug-2026')}
<table><tr><td>Decision Letter Sent:</td><td>29-Aug-2026</td></tr>
<tr><td>Decision Due:</td><td>15-Aug-2026</td></tr>
<tr><td>Associate Editor:</td><td><a>Editor, Sam</a> <a>AU</a> <a>REV</a> <a>AE</a></td></tr></table>`;

function doc(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
}

// The editor block as MC draws it: one cell, a line per role, and an
// Associate Editor List whose header row must not be read as labels.
const EDITOR_BLOCK = `
<div>CACM-26-03-1234</div>
<table><tr><td>Opinion<br>Make Decision</td>
<td>AE: <a>Editor, Sam</a><br>CC: <a>Co-Chair, Test</a><br>EIC: <a>Chief, Test</a><br>ADM: <a>Admin, Test</a></td></tr></table>
<table><tr><td>Order</td><td>Name</td><td>Status</td><td>History</td><td>Remove</td></tr>
<tr><td colspan="5">Pick from a list:</td></tr></table>`;

describe('milestones', () => {
  it('reads the AE from the editor block', () => {
    const v = versionInfoFrom(doc(EDITOR_BLOCK), 'CACM-26-03-1234');
    expect(v.ae).toBe('Editor, Sam');
    expect(v.coChair).toBe('Co-Chair, Test');
  });

  it('treats an unassigned AE as unknown', () => {
    const v = versionInfoFrom(doc(EDITOR_BLOCK.replace('<a>Editor, Sam</a>', 'Not Assigned')), 'CACM-26-03-1234');
    expect(v.ae).toBeUndefined();
  });

  it('does not read a column header row as a status', async () => {
    const { labeledValues } = await import('../parsers/dom');
    expect(labeledValues(doc(EDITOR_BLOCK).body).get('status')).toBeUndefined();
  });

  it('reads the earlier version', () => {
    const v = versionInfoFrom(doc(R1), 'CACM-26-03-1234.R1');
    expect(v).toEqual({ id: 'CACM-26-03-1234.R1', submitted: '01-Aug-2026', responded: '29-Aug-2026', ae: 'Editor, Sam', coChair: 'Chair, Pat' });
  });

  it('counts days and names versions', () => {
    expect(daysBetween('01-Aug-2026', '29-Aug-2026')).toBe(28);
    expect(daysBetween('x', '29-Aug-2026')).toBeNull();
    expect(versionName('X-26-03-1.R1')).toBe('R1');
    expect(versionName('X-26-03-1')).toBe('Original');
  });

  it('adds two bold brown rows under Date Submitted, once', () => {
    const d = doc(MILESTONES);
    expect(findMilestonesRow(d)).not.toBeNull();
    const info = { id: 'CACM-26-03-1234.R1', submitted: '01-Aug-2026', responded: '29-Aug-2026', ae: 'Editor, Sam', coChair: 'Chair, Pat' };
    expect(addMilestoneRows(d, info)).toBe(true);
    expect(addMilestoneRows(d, info)).toBe(true);
    const rows = Array.from(d.querySelectorAll('table.milestones tr'));
    // Ours go last, after MC's Co-Chair row.
    expect(rows).toHaveLength(5);
    const texts = rows.slice(3, 5).map((tr) => Array.from((tr as HTMLTableRowElement).cells).map((c) => c.textContent));
    expect(texts).toEqual([
      ['Date R1 submitted:', '01-Aug-2026', 'Date R1 response sent:', '29-Aug-2026 (28 days)'],
      ['R1 Associate Editor:', 'Editor, Sam', 'R1 Co-Chair:', 'Chair, Pat'],
    ]);
    const cell = (rows[3] as HTMLTableRowElement).cells[0]!;
    expect(cell.className).toBe('lbl');
    expect(cell.style.fontWeight).toBe('700');
    expect(cell.style.color).toBe('rgb(180, 83, 9)');
    expect(EMC_COLOR).toBe('#b45309');
  });

  it('does nothing without a milestones section', () => {
    expect(addMilestoneRows(doc('<table><tr><td>Date Submitted:</td><td>x</td></tr></table>'), { id: 'A-26-01-1.R1' })).toBe(false);
  });

  it('reads decision letters from the Audit Trail', () => {
    // Shaped like MC's Audit Trail: a grouping cell (the R1 bar) spans the rows.
    const d = doc(`<a href="#" onclick="go()">Audit Trail</a>
      <table><tr><th>Date / Time</th><th>Event</th><th>Manuscript Status</th></tr>
      <tr><td>12-Oct-2026 2:22 PM EDT</td><td>A revision of this manuscript was created by Author, A (Author)</td><td>Revision</td></tr>
      <tr><td rowspan="3">R1</td><td>06-Oct-2026 7:52 PM EDT<br>06-Oct-2026 11:52 PM GMT</td>
        <td>To: author@example.org From: eic@example.org Subject: Journal - Decision on Manuscript ID CACM-26-
        03-1234.R1 Results: Successfully sent. Template Name: RW - EIC Minor Revision</td><td></td></tr>
      <tr><td>06-Oct-2026 7:52 PM EDT</td><td>A decision of Minor Revision was made by Editor, E</td><td>Decisioned</td></tr>
      <tr><td>05-Oct-2026 1:00 PM EDT</td><td>Subject: Decision on Manuscript ID CACM-26-03-1234 Results: Failed.</td><td></td></tr>
      </table>`);
    expect([...decisionLettersIn(d)]).toEqual([['CACM-26-03-1234.R1', '06-Oct-2026']]);
    expect(findAuditTrailLink(d)?.tagName).toBe('A');
  });
});
