import { describe, expect, it } from 'vitest';
import { AFTER_POPUP_MS, BACK_CACHE_RULE, PopupTabs, backCacheRule } from '../lib/backcache';

describe('Back on MC', () => {
  it("drops MC's no-store from form posts in the main page only", () => {
    expect(BACK_CACHE_RULE.condition.requestDomains).toEqual(['manuscriptcentral.com']);
    expect(BACK_CACHE_RULE.condition.resourceTypes).toEqual(['main_frame']);
    expect(BACK_CACHE_RULE.condition.requestMethods).toEqual(['post']);
    expect(BACK_CACHE_RULE.condition.excludedTabIds).toBeUndefined();
    const headers = BACK_CACHE_RULE.action.responseHeaders!;
    expect(headers.find((h) => h.header === 'cache-control')).toMatchObject({ operation: 'set', value: 'private, max-age=0' });
    expect(headers.map((h) => h.header).sort()).toEqual(['cache-control', 'expires', 'pragma']);
  });

  it('leaves the given tabs alone', () => {
    expect(backCacheRule([9, 3]).condition.excludedTabIds).toEqual([3, 9]);
  });
});

describe('popup tabs', () => {
  it('leaves a popup and its opener alone, and the opener for a while after the popup closes', () => {
    const p = new PopupTabs();
    expect(p.excluded(0)).toEqual([]);
    p.opened(20, 10);
    expect(p.isPopup(20)).toBe(true);
    expect(p.excluded(0)).toEqual([10, 20]);
    expect(p.closed(20, 1000)).toBe(true);
    expect(p.excluded(1000)).toEqual([10]);
    expect(p.excluded(1000 + AFTER_POPUP_MS)).toEqual([]);
  });
  it('ignores tabs that were never popups', () => {
    const p = new PopupTabs();
    expect(p.closed(5, 0)).toBe(false);
    p.opened(7, undefined);
    expect(p.excluded(0)).toEqual([7]);
  });
});
