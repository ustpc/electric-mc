// @vitest-environment jsdom
// The offscreen lookup: the frame is sealed against moving the top page, the
// content scripts skip it, and the step driver walks search → Take Action →
// Switch Details on a fake sequence of synthetic pages.
import { describe, expect, it } from 'vitest';
import { FRAME_MARK, FRAME_SANDBOX, Unavailable, isOurFrame, lookupOffscreen, makeSealedFrame } from '../lib/offscreen';

const R1 = { id: 'XYZJ-26-10-9010.R1', baseId: 'XYZJ-26-10-9010', revision: 1 };

const DASHBOARD = '<div><input type="text"><button type="button">Search</button></div>';
const RESULTS = `<table><tr><th>ID</th><th>Title</th><th>Take Action</th></tr>
  <tr><td>XYZJ-26-10-9010.R1</td><td>A Synthetic Paper About Nothing</td><td><a href="#" id="take">Take Action</a></td></tr></table>`;
const history = (viewing: 'R0' | 'R1') => `<table><tr><th>Manuscript ID</th><th>Date Submitted</th><th>Switch Details</th></tr>
  <tr><td>XYZJ-26-10-9010.R1</td><td>02-Oct-2026</td><td>${viewing === 'R1' ? '' : '<a href="#" id="to-r1">switch</a>'}</td></tr>
  <tr><td>XYZJ-26-10-9010</td><td>01-Aug-2026</td><td>${viewing === 'R0' ? '' : '<a href="#" id="to-r0">switch</a>'}</td></tr></table>`;
const details = (id: string, ae: string, viewing: 'R0' | 'R1') => `<table>
  <tr><td><b>Manuscript ID:</b></td><td>${id}</td></tr>
  <tr><td><b>Title:</b></td><td>A Synthetic Paper About Nothing</td></tr>
  <tr><td><b>Associate Editor:</b></td><td>${ae}</td></tr></table>${history(viewing)}<p>Make Recommendation</p>`;

/** Serve synthetic pages into the frame: each click on a known element loads the next one. */
function fakeSite(first: string, routes: Record<string, string>) {
  const log: string[] = [];
  const timer = setInterval(() => {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-electric-mc="${FRAME_MARK}"]`);
    if (!frame || frame.dataset.served) return;
    frame.dataset.served = '1';
    const wired = new WeakSet<Document>();
    const load = (html: string) => setTimeout(() => {
      const d = frame.contentDocument!;
      if (!d.documentElement) d.appendChild(d.createElement('html'));
      if (!d.body) d.documentElement!.appendChild(d.createElement('body'));
      d.body.innerHTML = html;
      if (!wired.has(d)) {
        wired.add(d);
        d.addEventListener('click', (e) => {
          const el = e.target as HTMLElement;
          e.preventDefault();
          const key = el.id || el.textContent!.trim();
          log.push(key);
          if (routes[key]) load(routes[key]!);
        });
      }
      frame.dispatchEvent(new Event('load'));
    }, 0);
    load(first);
  }, 1);
  return { log, stop: () => clearInterval(timer) };
}

describe('sealed frame', () => {
  it('has exactly the sandbox and never allow-top-navigation or popups', () => {
    document.body.innerHTML = '';
    const f = makeSealedFrame(document, 'about:blank');
    expect(f.getAttribute('sandbox')).toBe(FRAME_SANDBOX);
    expect(f.getAttribute('sandbox')).not.toMatch(/top-navigation|popups/);
    expect(f.getAttribute('data-electric-mc')).toBe(FRAME_MARK);
  });

  it('is recognised from inside, so the content scripts skip it', () => {
    document.body.innerHTML = '';
    const f = makeSealedFrame(document, 'about:blank');
    expect(isOurFrame(f.contentWindow!)).toBe(true);
    expect(isOurFrame(window)).toBe(false);
    const other = document.createElement('iframe');
    document.body.appendChild(other);
    expect(isOurFrame(other.contentWindow!)).toBe(false);
  });
});

describe('lookupOffscreen', () => {
  it('searches, takes action, switches to R0 and reads its AE, all in the frame', async () => {
    document.body.innerHTML = '<form id="top"><input type="hidden" name="x" value="1"></form>';
    const site = fakeSite(DASHBOARD, {
      Search: RESULTS,
      take: details('XYZJ-26-10-9010.R1', 'Editor, Robin', 'R1'),
      'to-r0': details('XYZJ-26-10-9010', 'Editor, Pat', 'R0'),
    });
    const steps: string[] = [];
    try {
      const got = await lookupOffscreen({ doc: document, current: R1, wanted: ['XYZJ-26-10-9010'], stepMs: 2000, log: (e) => steps.push(e) });
      expect(got.get('XYZJ-26-10-9010')?.ae).toBe('Editor, Pat');
      expect(site.log).toEqual(['Search', 'take', 'to-r0']);
      expect(steps).toEqual(['offscreen frame loaded', 'offscreen search submitted', 'offscreen take action', 'offscreen version read', 'offscreen done']);
    } finally {
      site.stop();
    }
    // The frame is gone and the top page's form is as it was.
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.forms[0]!.hasAttribute('target')).toBe(false);
  });

  it('reports a login page in the frame as unavailable', async () => {
    document.body.innerHTML = '';
    const site = fakeSite('<input type="text"><input type="password"><button>Log In</button>', {});
    try {
      await expect(lookupOffscreen({ doc: document, current: R1, wanted: ['XYZJ-26-10-9010'], stepMs: 2000 })).rejects.toBeInstanceOf(Unavailable);
    } finally {
      site.stop();
    }
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('gives up when the search does not find exactly this manuscript', async () => {
    document.body.innerHTML = '';
    const site = fakeSite(DASHBOARD, { Search: '<p>No results</p>' });
    try {
      await expect(lookupOffscreen({ doc: document, current: R1, wanted: ['XYZJ-26-10-9010'], stepMs: 2000 })).rejects.toThrow(/did not find/);
    } finally {
      site.stop();
    }
  });

  it('stops when the page goes away', async () => {
    document.body.innerHTML = '';
    const stop = new AbortController();
    const p = lookupOffscreen({ doc: document, current: R1, wanted: ['XYZJ-26-10-9010'], stepMs: 5000, signal: stop.signal });
    stop.abort();
    await expect(p).rejects.toThrow(/aborted/);
    expect(document.querySelector('iframe')).toBeNull();
  });
});
