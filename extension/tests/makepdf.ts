// Writes a small PDF (Helvetica text at given positions) for the word-count
// tests. Only made-up text goes in: nothing from Manuscript Central.

export interface Run { x: number; y: number; text: string; size?: number }

const esc = (s: string) => s.replace(/[\\()]/g, (c) => '\\' + c);

export function makePdf(pages: Run[][], width = 612, height = 792): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => objs.push(s);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // pages, filled in below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const runs of pages) {
    const body = runs.map((r) => `BT /F1 ${r.size ?? 10} Tf ${r.x} ${r.y} Td (${esc(r.text)}) Tj ET`).join('\n');
    add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    const content = objs.length;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);
    kids.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** A made-up manuscript like MC's proofs: a cover page, then pages with a
 *  running header, a footer, line numbers in the left margin, and body text;
 *  the last page has References. */
export function fakeManuscript(opts: { bodyPages?: number; linesPerPage?: number; wordsPerLine?: number; refsLines?: number; copies?: number } = {}): { runs: Run[][]; bodyWords: number } {
  const { bodyPages = 3, linesPerPage = 40, wordsPerLine = 10, refsLines = 5, copies = 1 } = opts;
  const cover: Run[] = [
    { x: 100, y: 700, text: 'Submitted manuscript cover sheet for a made-up journal', size: 14 },
    { x: 100, y: 680, text: 'Manuscript ID XYZJ-2026-0001 and other cover details' },
  ];
  const vocab = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'theta', 'kappa', 'lambda', 'sigma', 'omega', 'pi', 'rho'];
  let w = 0;
  const copy: Run[][] = [];
  for (let p = 0; p < bodyPages; p++) {
    const runs: Run[] = [{ x: 400, y: 770, text: `Page ${p + 1} of ${bodyPages}` }, { x: 200, y: 20, text: 'Made-Up Journal Support Desk footer text' }];
    // The last page is half full, with the references under the text.
    const lines = p === bodyPages - 1 ? Math.ceil(linesPerPage / 2) : linesPerPage;
    for (let l = 0; l < lines; l++) {
      const y = 740 - l * 17;
      runs.push({ x: 20, y, text: String(l + 1) });
      const words = Array.from({ length: wordsPerLine }, (_, k) => vocab[(p * 31 + l * 7 + k * 3) % vocab.length]! + (p === 0 && l === 0 ? '' : String.fromCharCode(97 + ((l + k) % 26))));
      runs.push({ x: 60, y, text: words.join(' ') });
      w += words.length;
    }
    copy.push(runs);
  }
  const last = copy[copy.length - 1]!;
  const refY = 740 - Math.ceil(linesPerPage / 2) * 17 - 20;
  last.push({ x: 60, y: refY, text: 'References', size: 12 });
  for (let r = 0; r < refsLines; r++) last.push({ x: 60, y: refY - 14 * (r + 1), text: `${r + 1}. Author, A. A made-up reference, ${2000 + r}.` });
  const runs = [cover];
  for (let c = 0; c < copies; c++) runs.push(...copy);
  return { runs, bodyWords: w };
}
