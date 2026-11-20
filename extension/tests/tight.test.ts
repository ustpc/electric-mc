// @vitest-environment jsdom
// Tight mode on a synthetic page shaped like MC's.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGO_DELAY_MS, tightMode } from '../lib/tight';

const PAGE = `
<div class="hidden-phone hidden-tablet logoBar logoBarBcg-default"><div class="container">
  <a><img alt="Journal logo" src="/societyimages/xyzj/xyzj_banner.png"></a></div></div>
<table cellpadding="15" id="main"><tbody>
  <tr id="r-instr"><td width="8%"><img src="/images/en_US/page_headers/dashboard.gif"></td><td class="instructions">The tabs below organize all of the details. <a href="#">Read More</a></td></tr>
  <tr id="r-empty"><td colspan="2"> <br> </td></tr>
  <tr id="r-anchor"><td><a name="reftop"></a></td></tr>
  <tr id="r-err"><td><div id="MAIN_ERROR_DISPLAY_DIV" style="display:none"></div></td></tr>
  <tr id="r-text"><td>Reviewer List</td></tr>
  <tr id="r-form"><td class="instructions"><input name="x"></td></tr>
</tbody></table>`;

const mark = (id: string) => document.getElementById(id)!.getAttribute('data-emc-tight');
const html = () => document.documentElement;

afterEach(() => {
  tightMode(document, false);
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('tight mode', () => {
  it('marks the logo bar, the instructions row and empty rows, and keeps rows with content', () => {
    document.body.innerHTML = PAGE;
    const r = tightMode(document, false);
    expect(r).toEqual({ logo: true, instructions: 1, empty: 1 });
    expect(document.querySelector('.logoBar')!.getAttribute('data-emc-tight')).toBe('logo');
    expect([mark('r-instr'), mark('r-empty'), mark('r-anchor'), mark('r-err'), mark('r-text'), mark('r-form')]).toEqual(['row', 'empty', null, null, null, null]);
    expect(document.getElementById('main')!.getAttribute('data-emc-tight')).toBe('pad');
    // Off: marked, but nothing hidden.
    expect(html().hasAttribute('data-emc-tight-on')).toBe(false);
  });

  it('when on, hides at once and folds the logo away after a second; off undoes it', () => {
    vi.useFakeTimers();
    document.body.innerHTML = PAGE;
    tightMode(document, true);
    expect(html().hasAttribute('data-emc-tight-on')).toBe(true);
    expect(html().hasAttribute('data-emc-tight-logo')).toBe(false);
    vi.advanceTimersByTime(LOGO_DELAY_MS);
    expect(html().hasAttribute('data-emc-tight-logo')).toBe(true);
    tightMode(document, false);
    expect(html().hasAttribute('data-emc-tight-on') || html().hasAttribute('data-emc-tight-logo')).toBe(false);
  });

  it("leaves the instructions on MC's popups, where they are the page", () => {
    document.body.innerHTML = '<form><input type="hidden" name="CURRENT_PAGE" value="INSTRUCTIONS_POPUP"></form>' + PAGE;
    expect(tightMode(document, true).instructions).toBe(0);
  });

  it('shows a spacing row again once MC fills it in', () => {
    document.body.innerHTML = PAGE;
    tightMode(document, true);
    document.querySelector('#r-empty td')!.textContent = 'An error has occurred';
    tightMode(document, true);
    expect(mark('r-empty')).toBeNull();
  });
});
