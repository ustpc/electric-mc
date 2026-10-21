// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CLICK_ATTR, CLICK_EVENT, pageClick } from '../lib/click';

describe('pageClick', () => {
  it('lets the page world click when it is listening', () => {
    document.body.innerHTML = '<a href="#">Take Action</a>';
    const a = document.querySelector('a')!;
    let clicks = 0;
    a.addEventListener('click', (e) => { e.preventDefault(); clicks++; });
    const listener = (e: Event) => {
      const el = document.querySelector<HTMLElement>(`[${CLICK_ATTR}="${(e as CustomEvent<string>).detail}"]`)!;
      el.removeAttribute(CLICK_ATTR);
      el.click();
    };
    document.addEventListener(CLICK_EVENT, listener);
    pageClick(a);
    document.removeEventListener(CLICK_EVENT, listener);
    expect(clicks).toBe(1);
    expect(a.hasAttribute(CLICK_ATTR)).toBe(false);
  });

  it('clicks directly when nothing is listening', () => {
    document.body.innerHTML = '<a href="#">Take Action</a>';
    const a = document.querySelector('a')!;
    let clicks = 0;
    a.addEventListener('click', (e) => { e.preventDefault(); clicks++; });
    pageClick(a);
    expect(clicks).toBe(1);
    expect(a.hasAttribute(CLICK_ATTR)).toBe(false);
  });
});
