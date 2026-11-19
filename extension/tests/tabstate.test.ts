// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAB_KEYS, tabGet, tabSet, tabTake } from '../lib/tabstate';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('per-tab state', () => {
  it('names each key once', () => {
    const names = Object.values(TAB_KEYS);
    expect(new Set(names).size).toBe(names.length);
    names.forEach((n) => expect(n).toMatch(/^emc-[a-z-]+$/));
  });

  it('keeps JSON values, from a document or a window, and removes on null', () => {
    tabSet(document, 'advance', { from: 'XYZJ-26-09-9011', dir: 1, at: 5 });
    expect(tabGet(window, 'advance')).toEqual({ from: 'XYZJ-26-09-9011', dir: 1, at: 5 });
    expect(sessionStorage.getItem('emc-advance')).toBe('{"from":"XYZJ-26-09-9011","dir":1,"at":5}');
    expect(tabTake(document, 'advance')).toEqual({ from: 'XYZJ-26-09-9011', dir: 1, at: 5 });
    expect(tabGet(document, 'advance')).toBeNull();
    tabSet(document, 'navDir', -1);
    tabSet(document, 'navDir', null);
    expect(sessionStorage.getItem('emc-nav-dir')).toBeNull();
  });

  it('reads a broken value as missing, and survives blocked storage', () => {
    sessionStorage.setItem('emc-one-button', '{half');
    expect(tabGet(document, 'oneButton')).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => tabSet(document, 'oneButton', { x: 1 })).not.toThrow();
    expect(tabGet(null, 'oneButton')).toBeNull();
  });
});
