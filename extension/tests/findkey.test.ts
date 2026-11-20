// @vitest-environment jsdom
// Cmd-F / Ctrl-F on the matrix goes to its search box.
import { describe, expect, it } from 'vitest';
import { isFindKey, trapFind } from '../lib/findkey';

const press = (init: KeyboardEventInit) => {
  const e = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(e);
  return e;
};

describe('find shortcut', () => {
  it('knows Cmd-F and Ctrl-F, and nothing with other modifiers', () => {
    expect(isFindKey(new KeyboardEvent('keydown', { key: 'f', metaKey: true }))).toBe(true);
    expect(isFindKey(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true }))).toBe(true);
    expect(isFindKey(new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true }))).toBe(false);
    expect(isFindKey(new KeyboardEvent('keydown', { key: 'f' }))).toBe(false);
    expect(isFindKey(new KeyboardEvent('keydown', { key: 'g', metaKey: true }))).toBe(false);
  });

  it('focuses and selects the search box instead of the find bar, then lets a second press through', () => {
    document.body.innerHTML = '<input type="search" value="privacy"><button>x</button>';
    const box = document.querySelector('input')!;
    const stop = trapFind(document, () => box);
    const first = press({ metaKey: true });
    expect(first.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(box);
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 7]);
    expect(press({ metaKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: 'a', metaKey: true }).defaultPrevented).toBe(false);
    stop();
    box.blur();
    expect(press({ ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('does nothing when the page has no search box', () => {
    const stop = trapFind(document, () => null);
    expect(press({ metaKey: true }).defaultPrevented).toBe(false);
    stop();
  });
});
