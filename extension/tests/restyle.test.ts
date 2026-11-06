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

describe('hide a text page title', () => {
  it('hides a short title cell such as "View Manuscripts" beside the content', async () => {
    const { hidePageHeader } = await import('../lib/restyle');
    document.body.innerHTML = `<table width="760"><tr><td width="15%">View Manuscripts</td>
      <td width="85%"><p>${'Queue table text '.repeat(20)}</p></td></tr></table>`;
    hidePageHeader(document, true);
    expect(document.querySelector('td[width="15%"]')!.getAttribute('data-emc-hide')).toBe('header');
    // Content cells are never hidden.
    expect(document.querySelector('td[width="85%"]')!.hasAttribute('data-emc-hide')).toBe(false);
  });
  it('leaves a long or linked left cell alone', async () => {
    const { hidePageHeader } = await import('../lib/restyle');
    document.body.innerHTML = `<table width="760"><tr><td width="15%"><a href="#">Home</a></td>
      <td width="85%"><p>${'Queue table text '.repeat(20)}</p></td></tr></table>`;
    hidePageHeader(document, true);
    expect(document.querySelector('td[width="15%"]')!.hasAttribute('data-emc-hide')).toBe(false);
  });
});

describe('enlargeNavArrows', () => {
  it('redraws the previous/next document arrows twice as big, and puts MC\'s back when off', async () => {
    const { enlargeNavArrows, arrowImage } = await import('../lib/restyle');
    document.body.innerHTML = '<a href="#"><img src="/images/en_US/icons/prev_mss.gif" alt="Previous Document"></a> 7 / 8 <a href="#"><img src="/images/en_US/icons/next_mss.gif" alt="Next Document"></a><img src="/images/other.gif" id="other">';
    const [prev, next, other] = Array.from(document.querySelectorAll('img'));
    enlargeNavArrows(document, true);
    enlargeNavArrows(document, true);
    expect(prev!.getAttribute('src')).toBe(arrowImage('prev'));
    expect(next!.getAttribute('src')).toBe(arrowImage('next'));
    expect(next!.style.width).toBe('32px');
    expect(other!.getAttribute('src')).toBe('/images/other.gif');
    expect(decodeURIComponent(arrowImage('next'))).toContain('<svg');
    enlargeNavArrows(document, false);
    expect(next!.getAttribute('src')).toBe('/images/en_US/icons/next_mss.gif');
    expect(prev!.getAttribute('src')).toBe('/images/en_US/icons/prev_mss.gif');
    expect(next!.style.width).toBe('');
  });
});

describe('emphasizeVersionHistory', () => {
  const html = `<body style="font-size:11px"><div class="side">
      <div class="panel"><div class="panel-heading" id="head">Version History</div>
        <ul id="list"><li>XYZJ-26-07-1234.R1 <span id="date" style="font-size:10px">Submitted on 10-Oct-2026</span></li>
        <li><a href="#">XYZJ-26-07-1234</a> <a href="#" id="details">View Review Details</a></li></ul></div>
      <div id="other">Set My Search Preferences</div></div></body>`;

  it('makes the heading bold and the box one point larger, without compounding', async () => {
    const { emphasizeVersionHistory, applyRestyle, clearRestyle } = await import('../lib/restyle');
    clearRestyle(document);
    document.documentElement.innerHTML = html;
    const $ = (id: string) => document.getElementById(id)!;
    emphasizeVersionHistory(document, true);
    emphasizeVersionHistory(document, true);
    expect($('head').style.fontWeight).toBe('bold');
    expect($('head').style.fontSize).toBe('12.3px');
    expect($('date').style.fontSize).toBe('11.3px');
    expect($('details').style.fontSize).toBe('12.3px');
    expect($('other').style.fontSize).toBe('');
    // With the text-size preference, still one point above the scaled size.
    applyRestyle(document, { fullWidth: false, fontSize: 14 });
    emphasizeVersionHistory(document, true, 14);
    expect($('head').style.fontSize).toBe('15.3px');
    expect($('other').style.fontSize).toBe('');
    expect(document.body.style.fontSize).toBe('14px');
    applyRestyle(document, { fullWidth: false, fontSize: 14 });
    emphasizeVersionHistory(document, true, 14);
    expect($('head').style.fontSize).toBe('15.3px');
    emphasizeVersionHistory(document, false);
    expect($('head').style.fontWeight).toBe('');
    expect($('head').style.fontSize).toBe('');
  });

  it('leaves pages without a Version History box alone', async () => {
    const { emphasizeVersionHistory } = await import('../lib/restyle');
    document.documentElement.innerHTML = '<body><p id="p">Version History is explained in the help.</p></body>';
    emphasizeVersionHistory(document, true);
    expect(document.getElementById('p')!.style.fontSize).toBe('');
  });
});

describe('enlargePagerArrows', () => {
  it('redraws the grid page arrows twice as big, leaving the page picker alone', async () => {
    const { enlargePagerArrows, pagerImage } = await import('../lib/restyle');
    document.body.innerHTML = `<table><tr><td>Awaiting AE Assignment</td><td id="range">Manuscripts <select><option>11-12</option></select> of 12
      <a href="#" id="back"><img src="/images/en_US/icons/arrow_left.gif"></a> <a href="#" id="fwd"><img src="/images/en_US/icons/arrow_right.gif"></a></td></tr></table>
      <a href="#" id="other"><img src="/images/en_US/icons/arrow_left.gif"></a>`;
    enlargePagerArrows(document, true);
    enlargePagerArrows(document, true);
    expect(document.querySelector('#back img')!.getAttribute('src')).toBe(pagerImage('prev'));
    expect(document.querySelector('#fwd img')!.getAttribute('src')).toBe(pagerImage('next'));
    expect((document.querySelector('#fwd img') as HTMLElement).style.width).toBe('16px');
    expect(document.querySelector('#other img')!.getAttribute('src')).toBe('/images/en_US/icons/arrow_left.gif');
    enlargePagerArrows(document, false);
    expect(document.querySelector('#fwd img')!.getAttribute('src')).toBe('/images/en_US/icons/arrow_right.gif');
  });
});
