// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clickBus } from '../lib/clickbus';

describe('the click bus', () => {
  it('runs phases in order whatever order handlers were added, and a guard stops the rest', () => {
    document.body.innerHTML = '<a href="#" id="a">x</a>';
    const bus = clickBus(document);
    const seen: string[] = [];
    let block = false;
    bus.add('act', () => seen.push('act'));
    bus.add('record', () => seen.push('record'));
    bus.add('guard', (e) => {
      seen.push('guard');
      if (block) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    });
    bus.add('trace', () => seen.push('trace'));
    let page = 0;
    document.getElementById('a')!.addEventListener('click', () => page++);
    const press = () => document.getElementById('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    press();
    expect(seen).toEqual(['trace', 'guard', 'record', 'act']);
    expect(page).toBe(1);
    seen.length = 0;
    block = true;
    expect(press()).toBe(false);
    expect(seen).toEqual(['trace', 'guard']);
    expect(page).toBe(0 + 1); // MC's own handler didn't run either
    bus.stop();
  });

  it('keeps going when a handler throws', () => {
    const bus = clickBus(document);
    const seen: string[] = [];
    const off = bus.add('record', () => {
      throw new Error('boom');
    });
    bus.add('act', () => seen.push('act'));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual(['act']);
    off();
    bus.stop();
  });
});
