// Where the side panel shows: Manuscript Central tabs only. Synthetic URLs.
import { describe, expect, it } from 'vitest';
import { PANEL_PATH, panelEnabledFor, panelOptionsFor } from '../lib/messages';

describe('panelEnabledFor', () => {
  it('shows on Manuscript Central', () => {
    expect(panelEnabledFor('https://mc.manuscriptcentral.com/xyzj')).toBe(true);
    expect(panelEnabledFor('https://manuscriptcentral.com/')).toBe(true);
  });
  it('hides everywhere else', () => {
    for (const url of ['https://example.org/', 'http://mc.manuscriptcentral.com/xyzj', 'https://manuscriptcentral.com.example.org/', 'chrome://extensions', 'about:blank', 'not a url', '', undefined])
      expect(panelEnabledFor(url)).toBe(false);
  });
});

describe('panelOptionsFor', () => {
  const MC = 'https://mc.manuscriptcentral.com/xyzj';
  it('leaves MC tabs on the window panel unless we switched them off', () => {
    expect(panelOptionsFor(MC, false)).toBeNull();
    expect(panelOptionsFor(MC, true)).toEqual({ enabled: true, path: PANEL_PATH });
  });
  it('switches other tabs off', () => {
    expect(panelOptionsFor('https://example.org/', false)).toEqual({ enabled: false });
    expect(panelOptionsFor('chrome://newtab/', true)).toEqual({ enabled: false });
    expect(panelOptionsFor(undefined, false)).toEqual({ enabled: false });
  });
  it('never enables a tab without a path', () => {
    for (const url of [MC, 'https://example.org/', undefined])
      for (const was of [true, false]) {
        const o = panelOptionsFor(url, was);
        if (o?.enabled) expect(o.path).toBe(PANEL_PATH);
      }
  });
});
