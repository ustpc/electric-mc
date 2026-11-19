// Saved real MC pages (var/real-pages/<CURRENT_PAGE>.html): the parsers on
// today's MC. Reports MC page names and counts only.
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePage } from '../parsers';
import { currentPage, pageTypeOf } from '../lib/mcpage';
import { redactResult } from '../lib/log';
import { files, HAVE_VAR, leaks, read } from './data';

const pages = files(/\.html$/, 'real-pages');

function load(path: string): { doc: Document; url: string } {
  const html = read(path);
  const meta = /<!-- electric-mc-capture (\{.*?\}) -->/.exec(html);
  const url = (meta ? (JSON.parse(meta[1]!) as { url?: string }).url : undefined) ?? 'https://mc.manuscriptcentral.com/xyzj';
  return { doc: new DOMParser().parseFromString(html, 'text/html'), url };
}

describe.skipIf(!HAVE_VAR || !pages.length)(`real MC pages (${pages.length})`, () => {
  for (const path of pages) {
    const name = basename(path, '.html');
    it(name, () => {
      const { doc, url } = load(path);
      const r = parsePage(doc, url);
      const mc = currentPage(doc);
      const expected = pageTypeOf(mc);
      // The page type agrees with MC's own name for the page, when it says.
      expect(expected === null || r.pageType === expected, `${name}: classified ${r.pageType}, MC says ${expected ?? '?'}`).toBe(true);
      if (r.pageType === 'manuscript') expect(!!r.manuscript, `${name}: no manuscript parsed`).toBe(true);
      if (r.pageType === 'queue-list') expect((r.rows?.length ?? 0) > 0, `${name}: no rows parsed`).toBe(true);
      // The redacted parse (what a shared log export holds) names nothing.
      const red = JSON.stringify(redactResult(r));
      const l = leaks(red);
      expect(l.ids + l.emails, `${name}: redacted parse holds ${l.ids} IDs and ${l.emails} emails`).toBe(0);
      const title = r.manuscript?.title;
      expect(!!title && title.length > 10 && red.includes(title), `${name}: redacted parse holds the title`).toBe(false);
    });
  }
});
