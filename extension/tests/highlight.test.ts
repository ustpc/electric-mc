import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { clearHighlights, highlightRevisions } from '../lib/highlight';

const load = (f: string) => new JSDOM(readFileSync(join(__dirname, 'fixtures', f), 'utf8')).window.document;

describe('revision highlighting', () => {
  it('marks both rows of each revision and nothing else', () => {
    const doc = load('queue-rowspan.html');
    expect(highlightRevisions(doc)).toBe(2);
    const marked = Array.from(doc.querySelectorAll('tr[data-emc-revision]')).map((tr) => (tr as HTMLTableRowElement).cells[0]!.textContent!.trim());
    expect(marked).toEqual([
      'XYZJ-26-03-1111.R2',
      'Opinion',
      'XYZJ-26-08-9006.R1',
      'Opinion',
    ]);
    expect(doc.getElementById('emc-highlight-style')).not.toBeNull();
  });
  it('works on single-row queues and clears', () => {
    const doc = load('queue-list.html');
    expect(highlightRevisions(doc)).toBe(1);
    clearHighlights(doc);
    expect(doc.querySelectorAll('[data-emc-revision]').length).toBe(0);
  });
});
