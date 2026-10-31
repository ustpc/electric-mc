// @vitest-environment jsdom
// Keepalives: when one is due, and pressing MC's "+ Search" toggle twice
// (open, then close). Synthetic markup only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GIVE_UP_MS, IDLE_MS, findSearchToggle, keepaliveDue, sendKeepalive } from '../lib/keepalive';

const MIN = 60_000;

describe('keepaliveDue', () => {
  const now = 1_000 * MIN;
  it('waits for 10 idle minutes', () => {
    expect(keepaliveDue(now, now - 9 * MIN, 0)).toBe(false);
    expect(keepaliveDue(now, now - IDLE_MS, 0)).toBe(true);
  });
  it('sends again only 10 minutes after the last keepalive', () => {
    expect(keepaliveDue(now, now - 30 * MIN, now - 5 * MIN)).toBe(false);
    expect(keepaliveDue(now, now - 30 * MIN, now - 10 * MIN)).toBe(true);
  });
  it('gives up after 8 hours without activity', () => {
    expect(keepaliveDue(now, now - GIVE_UP_MS + MIN, 0)).toBe(true);
    expect(keepaliveDue(now, now - GIVE_UP_MS, 0)).toBe(false);
  });
});

const PAGE = `<div class="breadcrumb"><a href="#">Co-Chair Dashboard</a> / <a href="#">Awaiting AE Assignment</a>
  <a href="#" id="toggle"><i class="icon-plus"></i> Search</a></div>
  <div><input type="text"><button id="go">Search</button></div>`;

describe('the "+ Search" toggle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('finds the breadcrumb toggle, not the search form button', () => {
    document.body.innerHTML = PAGE;
    expect(findSearchToggle(document)?.id).toBe('toggle');
  });

  it('opens and closes the search bar, and never presses Search itself', async () => {
    document.body.innerHTML = PAGE;
    const clicks: string[] = [];
    for (const id of ['toggle', 'go']) document.getElementById(id)!.addEventListener('click', (e) => { e.preventDefault(); clicks.push(id); });
    const p = sendKeepalive(document);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toEqual({ found: true, requests: 0 });
    expect(clicks).toEqual(['toggle', 'toggle']);
  });

  it('reports a page without the toggle', async () => {
    document.body.innerHTML = '<p>Log In</p>';
    expect(await sendKeepalive(document)).toEqual({ found: false, requests: 0 });
  });
});
