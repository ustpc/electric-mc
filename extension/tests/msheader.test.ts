// @vitest-environment jsdom
// The manuscript header as MC draws it today: a table, the ID in bold on the
// first row and the title on the next. A resubmission has a "Resubmitted"
// link beside the ID. Synthetic markup; the ID, title and names are made up.
import { describe, expect, it } from 'vitest';
import { extractManuscript } from '../parsers/extract';

const header = (beside: string) => `<table><tbody>
  <tr>
    <td width="1%"><img src="notes.gif"></td>
    <td><p class="pagecontents"><b>XYZJ-26-11-9001</b>${beside}</p></td>
    <td align="right">
      <p class="footer">Submitted: 18-Nov-2026;</p>
      <p class="footer">Last Updated: 18-Nov-2026;</p>
      <p class="footer">In Review: 8d 10h 25min 19sec</p>
    </td>
  </tr>
  <tr><td width="1%"><img src="dot.gif"></td><td colspan="2"><p class="pagecontents">An Invented Title About Synthetic Machines</p></td></tr>
  <tr><td width="1%"><img src="dot.gif"></td><td colspan="2"><p class="pagecontents"><a href="#">Author, Example</a> (contact)</p></td></tr>
  <tr><td width="1%"><img src="dot.gif"></td><td colspan="2"><p class="pagecontents">Opinion</p></td></tr>
</tbody></table>`;

const parse = (html: string) => {
  document.body.innerHTML = html;
  return extractManuscript(document);
};

describe('manuscript header title', () => {
  it('reads the title on the row after the ID', () => {
    const r = parse(header(''));
    expect(r.value?.id).toBe('XYZJ-26-11-9001');
    expect(r.value?.title).toBe('An Invented Title About Synthetic Machines');
    expect(r.warnings).not.toContain('manuscript: no title');
  });

  it('still reads it when MC puts "Resubmitted" beside the ID', () => {
    for (const tag of [' <a href="#">Resubmitted</a>', ' <span class="resubmitted">Resubmitted</span>']) {
      const r = parse(header(tag));
      expect(r.value?.id).toBe('XYZJ-26-11-9001');
      expect(r.value?.title).toBe('An Invented Title About Synthetic Machines');
      expect(r.strategies.title).toBe('line after id');
    }
  });

  it('keeps using the nearest line when it has a next one', () => {
    const r = parse(`<table><tbody><tr><td><div>XYZJ-26-11-9002</div><div>A Made-Up Title For A Layout Check</div></td></tr>
      <tr><td>Something else entirely</td></tr></tbody></table>`);
    expect(r.value?.title).toBe('A Made-Up Title For A Layout Check');
  });
});
