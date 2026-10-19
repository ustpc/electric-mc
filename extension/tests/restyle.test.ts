// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyRestyle, clearRestyle, findColumn } from '../lib/restyle';

function page(): Document {
  // The live document, since parsed documents have no window for computed styles.
  const d = document;
  clearRestyle(d);
  d.documentElement.innerHTML = `<head></head><body style="font-size:11px">
      <div id="top">MC</div>
      <table id="col" width="850" align="center"><tr><td>
        <table id="inner" width="850"><tr><td id="cell">${'Manuscript text '.repeat(40)}</td>
        <td id="small" style="font-size:9px">small</td></tr></table>
      </td></tr></table></body>`;
  Object.defineProperty(d.documentElement, 'clientWidth', { value: 1600, configurable: true });
  const widths: Record<string, number> = { col: 850, inner: 850 };
  for (const el of Array.from(d.body.querySelectorAll('*'))) {
    (el as HTMLElement).getBoundingClientRect = () => ({ width: widths[el.id] ?? 100 }) as DOMRect;
  }
  return d;
}

describe('restyle', () => {
  it('finds the fixed, centered column and widens it with its inner tables', () => {
    const d = page();
    expect(findColumn(d)?.id).toBe('col');
    applyRestyle(d, { fullWidth: true, fontSize: 0 });
    expect(d.getElementById('col')!.getAttribute('data-emc-wide')).toBe('outer');
    expect(d.getElementById('inner')!.getAttribute('data-emc-wide')).toBe('inner');
    expect(d.getElementById('emc-restyle-style')!.textContent).toContain('calc(100vw - 1in)');
    applyRestyle(d, { fullWidth: false, fontSize: 0 });
    expect(d.querySelector('[data-emc-wide]')).toBeNull();
    expect(d.getElementById('emc-restyle-style')).toBeNull();
  });

  it('scales text sizes without compounding and undoes it', () => {
    const d = page();
    applyRestyle(d, { fullWidth: false, fontSize: 14 });
    expect(d.body.style.fontSize).toBe('14px');
    const small = d.getElementById('small')!;
    expect(parseFloat(small.style.fontSize)).toBeCloseTo((9 * 14) / 11, 1);
    applyRestyle(d, { fullWidth: false, fontSize: 14 });
    applyRestyle(d, { fullWidth: false, fontSize: 16 });
    expect(d.body.style.fontSize).toBe('16px');
    expect(parseFloat(small.style.fontSize)).toBeCloseTo((9 * 16) / 11, 1);
    clearRestyle(d);
    expect(small.style.fontSize).toBe('');
    expect(d.querySelector('[data-emc-fs]')).toBeNull();
  });
});

describe('restyle on a captured page shape', () => {
  it('picks the centered 760px table, not the hidden dialog or scripts', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const html = readFileSync(join(__dirname, 'fixtures', 'queue-status-tables.html'), 'utf8');
    document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html>/, '').replace(/<\/html>\s*$/, '');
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const w = el.getAttribute('width');
      (el as HTMLElement).getBoundingClientRect = () => ({ width: w === '760' ? 760 : w === '350' ? 350 : 100 }) as DOMRect;
    }
    expect(findColumn(document)?.getAttribute('width')).toBe('760');
  });
});

describe('hide the page title column', () => {
  it('hides the title image row and the empty spacer cell, and brings them back', async () => {
    const { hidePageHeader } = await import('../lib/restyle');
    // Shaped like MC's layout (2026-10-18 capture); text is made up.
    document.body.innerHTML = `<table width="760"><tr><td><table width="100%"><tr>
        <td width="8%"><img src="/images/en_US/page_headers/search_results_header.gif"></td>
        <td width="75%" class="instructions">&nbsp;</td></tr></table></td></tr>
      <tr><td width="15%"></td><td width="85%"><p>${'Results table text '.repeat(20)}</p></td></tr></table>`;
    hidePageHeader(document, true);
    const header = document.querySelector('img')!.closest('tr')!;
    const spacer = document.querySelector('td[width="15%"]')!;
    expect(header.getAttribute('data-emc-hide')).toBe('header');
    expect(spacer.getAttribute('data-emc-hide')).toBe('spacer');
    expect(document.documentElement.hasAttribute('data-emc-hide-headers')).toBe(true);
    hidePageHeader(document, false);
    expect(document.documentElement.hasAttribute('data-emc-hide-headers')).toBe(false);
  });
});
