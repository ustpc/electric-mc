// @vitest-environment jsdom
// The page snapshot (Capture page HTML, weekly page samples) is made in an
// inert document, never by cloning the live page: cloning MC's
// body (it has an onunload attribute) inside the page broke its permissions policy. And no
// extension source registers an unload handler. Synthetic markup only.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { snapshotHtml } from '../lib/pagesample';

describe('page snapshot', () => {
  it('leaves out our marks, scripts, handlers and typed text without cloning the live page', () => {
    document.documentElement.innerHTML = `<head><script>var x = 1;</script></head><body onunload="bye()" onload="hi()">
      <div data-electric-mc="badge">ours</div><a href="#" onclick="go()">XYZJ-26-09-9011</a>
      <input type="text" value="typed"><input type="password" value="secret"><textarea>draft</textarea></body>`;
    const clone = vi.spyOn(document.documentElement, 'cloneNode');
    const html = snapshotHtml(document);
    expect(clone).not.toHaveBeenCalled();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('XYZJ-26-09-9011');
    for (const gone of ['onunload', 'onload', 'onclick', '<script', 'data-electric-mc', 'typed', 'secret', 'draft']) expect(html).not.toContain(gone);
    // The live page is untouched.
    expect(document.body.getAttribute('onunload')).toBe('bye()');
    expect(document.querySelector('[data-electric-mc]')).toBeTruthy();
  });
});

describe('no unload handlers', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  it('no source adds an unload listener, sets onunload, or clones the whole page', () => {
    const root = join(__dirname, '..');
    const bad = ['lib', 'entrypoints', 'components', 'parsers']
      .flatMap((d) => files(join(root, d)))
      .filter((f) => /addEventListener\(\s*['"`]unload['"`]|\bonunload\s*=|documentElement\.cloneNode/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});

describe('the log never holds page titles', () => {
  it('logs only the lengths when it puts the page title back', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'entrypoints', 'content.ts'), 'utf8');
    const line = src.split('\n').find((l) => l.includes("'title reapplied'"))!;
    expect(line).toContain('fromLength');
    expect(line).not.toMatch(/data: \{ from, to \}/);
  });
});
