// @vitest-environment jsdom
// MC's flag icons: learning their labels from the Flag This Manuscript panel
// and naming them on lists. Synthetic markup only.
import { describe, expect, it } from 'vitest';
import { flagPanel, iconKey, labelFlags, readFlagPanel } from '../lib/flags';

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
});
