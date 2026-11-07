import { describe, expect, it } from 'vitest';
import { BACK_CACHE_RULE } from '../lib/backcache';

describe('Back on MC', () => {
  it("drops MC's no-store from its own pages only", () => {
    expect(BACK_CACHE_RULE.condition.requestDomains).toEqual(['manuscriptcentral.com']);
    expect(BACK_CACHE_RULE.condition.resourceTypes).toEqual(['main_frame', 'sub_frame']);
    const headers = BACK_CACHE_RULE.action.responseHeaders!;
    expect(headers.find((h) => h.header === 'cache-control')).toMatchObject({ operation: 'set', value: 'private, max-age=0' });
    expect(headers.map((h) => h.header).sort()).toEqual(['cache-control', 'expires', 'pragma']);
  });
});
