// @vitest-environment jsdom
// MC's flag icons: learning their labels from the Flag This Manuscript panel
// and naming them on lists. Synthetic markup only.
import { describe, expect, it } from 'vitest';
import { cleanFlagMap, flagPanel, iconKey, labelFlags, readFlagPanel } from '../lib/flags';

const PANEL = `<table><tr><td class="hdr">Flag This Manuscript</td></tr>
  <tr><td><input type="checkbox"><img src="/images/flags/flag_red_x.gif?v=2"> 3 or more rejections</td></tr>
  <tr><td><input type="checkbox"><img src="/images/flags/star.png"> Invited submission</td></tr>
  <tr><td><img src="/t.gif"> spacer row</td></tr>
</table>`;

const LIST = `<table><tr><th>Manuscript ID</th><th>Status</th></tr>
  <tr><td>XYZJ-26-09-9011 <img src="/images/flags/flag_red_x.gif"></td><td>AE: Not Assigned <img src="/b.gif"></td></tr>
  <tr><td>XYZJ-26-09-9012 <img src="/images/flags/unknown.gif"></td><td>AE: Not Assigned</td></tr>
</table>`;

describe('flags', () => {
  it('keys icons by file name and skips spacers', () => {
    const img = document.createElement('img');
    img.setAttribute('src', '/a/B/Flag_Red_X.GIF?x=1');
    expect(iconKey(img)).toBe('flag_red_x.gif');
    img.setAttribute('src', '/t.gif');
    expect(iconKey(img)).toBeNull();
  });

  it('learns each icon and its label from the panel', () => {
    document.body.innerHTML = PANEL;
    expect(readFlagPanel(flagPanel(document)!)).toEqual({ 'flag_red_x.gif': '3 or more rejections', 'star.png': 'Invited submission' });
  });

  it('names known flags on a list in italic brown, and only those', () => {
    document.body.innerHTML = LIST;
    const map = { 'flag_red_x.gif': '3 or more rejections' };
    expect(labelFlags(document, map, true)).toBe(1);
    const note = document.querySelector<HTMLElement>('[data-electric-mc="flag-label"]')!;
    expect(note.textContent).toBe('(flagged: 3 or more rejections)');
    expect(note.style.fontStyle).toBe('italic');
    expect(note.style.fontWeight).toBe('400');
    expect(note.previousElementSibling?.getAttribute('src')).toBe('/images/flags/flag_red_x.gif');
    // Again: still one; switched off: none.
    labelFlags(document, map, true);
    expect(document.querySelectorAll('[data-electric-mc="flag-label"]')).toHaveLength(1);
    expect(labelFlags(document, map, false)).toBe(0);
    expect(document.querySelectorAll('[data-electric-mc="flag-label"]')).toHaveLength(0);
  });

  it('leaves the panel itself alone', () => {
    document.body.innerHTML = PANEL;
    expect(labelFlags(document, { 'flag_red_x.gif': '3 or more rejections' }, true)).toBe(0);
  });

  // What 0.0.78 got wrong on a real details page (synthetic markup): it learned
  // bullets, "req" marks and person icons near the heading as flags.
  it('learns only flag icons, from words, tooltip or alt text, and never a name or a manuscript ID', () => {
    document.body.innerHTML = `<div><div><b>Flag This Manuscript</b></div>
      <table><tr><td><a href="#"><img src="/images/en_US/flags/flag_red.gif" title="Needs a second look"></a></td></tr>
      <tr><td><img src="/images/en_US/flags/flag_blue.gif" alt="Invited"></td></tr></table>
      <table><tr><td><img src="/images/req.gif"> Number of Words: 999 (including references)</td></tr>
      <tr><td><img src="/images/arrow.gif"> XYZJ-26-08-9001.R1</td></tr>
      <tr><td><img src="/images/person.gif"> Example, Pat</td></tr>
      <tr><td><img src="/images/flags/flag_grey.gif"> Example, Robin</td></tr></table></div>`;
    expect(readFlagPanel(flagPanel(document)!)).toEqual({ 'flag_red.gif': 'Needs a second look', 'flag_blue.gif': 'Invited' });
  });

  it('labels only flag icons, after their link, and not in Version History', () => {
    const map = { 'flag_red.gif': 'Needs a second look', 'req.gif': 'Number of Words: 999', 'minus.gif': 'Reviewer Locator', 'flag_grey.gif': 'Example, Pat' };
    document.body.innerHTML = `<table><tr><td>XYZJ-26-09-9011 <a href="#" id="l"><img src="/images/flags/flag_red.gif"></a></td></tr>
      <tr><td><img src="/images/req.gif"> req</td></tr><tr><td><img src="/images/minus.gif"> Notes</td></tr>
      <tr><td><img src="/images/flags/flag_grey.gif"> XYZJ-26-09-9012</td></tr></table>
      <div><div>Version History</div><div><img src="/images/flags/flag_red.gif"> XYZJ-26-08-9001</div></div>`;
    expect(labelFlags(document, map, true)).toBe(1);
    const note = document.querySelector('[data-electric-mc="flag-label"]')!;
    expect(note.textContent).toBe('(flagged: Needs a second look)');
    expect(note.previousElementSibling?.id).toBe('l');
    expect(note.closest('a')).toBeNull();
  });

  it('drops names and manuscript IDs from a stored map', () => {
    expect(cleanFlagMap({ 'a.gif': 'Hold', 'b.gif': 'Example, Pat', 'c.gif': 'XYZJ-26-08-9001' })).toEqual({ 'a.gif': 'Hold' });
  });
});
