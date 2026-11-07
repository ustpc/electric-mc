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
  it('gives MC tabs their own panel', () => {
    expect(panelOptionsFor('https://mc.manuscriptcentral.com/xyzj')).toEqual({ enabled: true, path: PANEL_PATH });
  });
  it('switches every other tab off', () => {
    for (const url of ['https://example.org/', 'https://docs.google.com/spreadsheets/d/x', 'chrome://newtab/', undefined])
      expect(panelOptionsFor(url)).toEqual({ enabled: false });
  });
});
