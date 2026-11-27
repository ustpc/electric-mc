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

describe('manuscript header status, type and authors', () => {
  it('reads them from the unlabeled rows, with or without "Resubmitted"', () => {
    for (const beside of ['', ' <a href="#">Resubmitted</a>']) {
      const r = parse(header(beside));
      expect(r.value?.status).toBe('In Review');
      expect(r.value?.type).toBe('Opinion');
      expect(r.value?.authors).toBe('Author, Example (contact)');
      expect(r.strategies).toMatchObject({ status: 'header', type: 'header', authors: 'header' });
    }
  });

  it('reads several authors, and stops at MC\'s task rows', () => {
    const html = `<table><tbody>
      <tr><td><p class="pagecontents"><b>XYZJ-26-11-9003</b></p></td><td align="right"><p class="footer">Submitted: 01-Nov-2026;</p><p class="footer">Awaiting Decision: 2d 3h 4min 5sec</p></td></tr>
      <tr><td colspan="2"><p class="pagecontents">Another Invented Title For Testing</p></td></tr>
      <tr><td colspan="2"><p class="pagecontents"><a href="#">One, Writer</a> (contact), <a href="#">Two, Writer</a></p></td></tr>
      <tr><td colspan="1"><p class="pagecontents"><font>Make Immediate Decision</font></p></td><td align="right"><p>AE <a href="#">Editor, Sample</a></p></td></tr>
      <tr><td colspan="1"><p class="pagecontents"><font>Assign AE (Due 20-Nov-2026)</font></p></td></tr>
    </tbody></table>`;
    const r = parse(html);
    expect(r.value?.status).toBe('Awaiting Decision');
    expect(r.value?.authors).toBe('One, Writer (contact), Two, Writer');
    expect(r.value?.type).toBeUndefined();
  });

  it('falls back to labeled fields when there is no header', () => {
    const r = parse(`<table>
      <tr><td>Manuscript ID:</td><td>XYZJ-26-11-9004</td></tr>
      <tr><td>Title:</td><td>A Labeled Title For The Fallback</td></tr>
      <tr><td>Manuscript Type:</td><td>Viewpoint</td></tr>
      <tr><td>Submitting Author:</td><td>Person, Made Up</td></tr>
    </table>`);
    expect(r.value?.type).toBe('Viewpoint');
    expect(r.value?.authors).toBe('Person, Made Up');
    expect(r.strategies.type).toBe('label "manuscript type"');
  });
});
