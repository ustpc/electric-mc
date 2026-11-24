// MC's page logout countdown is restarted after a keepalive (lib/pagetimer.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchLongTimers } from '../lib/pagetimer';

describe('MC logout countdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const fakeWin = () => ({ setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }) as unknown as Window;

  it('restarts long timers from now and leaves short ones alone', () => {
    const win = fakeWin();
    const t = watchLongTimers(win);
    const logout = vi.fn();
    const short = vi.fn();
    win.setTimeout(logout, 178 * 60_000);
    win.setTimeout(short, 1000);
    expect(t.pending()).toBe(1);
    vi.advanceTimersByTime(170 * 60_000);
    expect(short).toHaveBeenCalledOnce();
    expect(t.restart()).toBe(1);
    vi.advanceTimersByTime(170 * 60_000);
    expect(logout).not.toHaveBeenCalled();
    expect(t.restart()).toBe(1); // again, from the restarted one
    vi.advanceTimersByTime(178 * 60_000);
    expect(logout).toHaveBeenCalledOnce();
    expect(t.pending()).toBe(0);
  });

  it('lets MC cancel its timer by the id it was given, also after a restart', () => {
    const win = fakeWin();
    const t = watchLongTimers(win);
    const logout = vi.fn();
    const id = win.setTimeout(logout, 60 * 60_000);
    t.restart();
    win.clearTimeout(id);
    vi.advanceTimersByTime(2 * 60 * 60_000);
    expect(logout).not.toHaveBeenCalled();
    expect(t.pending()).toBe(0);
  });

  it('passes arguments through', () => {
    const win = fakeWin();
    const t = watchLongTimers(win);
    const f = vi.fn();
    win.setTimeout(f, 40 * 60_000, 'a', 2);
    t.restart();
    vi.advanceTimersByTime(40 * 60_000);
    expect(f).toHaveBeenCalledWith('a', 2);
  });
});
