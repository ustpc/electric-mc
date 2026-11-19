// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { featuresOff, runFeatures, type Feature, type PageContext } from '../lib/features/feature';
import { queueMarks } from '../lib/features/queuemarks';
import { recordIdentity, recordRoles } from '../lib/features/recorders';
import { DEFAULT_SETTINGS } from '../lib/messages';
import type { ParseResult } from '../parsers/types';
import { journalKey } from '../lib/aeload';

const ctx = (result: Partial<ParseResult>, send = vi.fn()): PageContext => ({ doc: document, result: { breadcrumb: [], site: 'xyzj', pageType: 'unknown', ...result } as ParseResult, reason: 'load', settings: DEFAULT_SETTINGS, send, letters: () => new Map(), get: () => Promise.resolve(undefined) });

describe('content features', () => {
  it('keeps running the others when one throws, and logs it', () => {
    const send = vi.fn();
    const after = vi.fn();
    const bad: Feature = { id: 'bad', onPage: () => { throw new Error('boom'); } };
    runFeatures([bad, { id: 'ok', onPage: after }], ctx({}, send));
    expect(after).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'feature failed', data: expect.objectContaining({ feature: 'bad' }) }));
  });

  it('sends who is logged in once, and again only when it changes', () => {
    document.head.innerHTML = '<script>PENDO_SERVICE.initializePendoMetadata({visitor: {id:"1", email:"a@example.org", firstName:"Pat", lastName:"Editor"}});</script>';
    const send = vi.fn();
    const f = recordIdentity();
    f.onPage(ctx({}, send));
    f.onPage(ctx({}, send));
    expect(send.mock.calls.filter(([m]) => (m as { type: string }).type === 'identity')).toHaveLength(1);
    document.head.innerHTML = '';
  });

  it('links queue IDs and undoes it when switched off', () => {
    document.body.innerHTML = '<table><tr><th>ID</th><th>Take Action</th></tr><tr><td>XYZJ-26-09-9011</td><td><a href="#">go</a></td></tr></table>';
    const f = queueMarks();
    f.onPage(ctx({ pageType: 'queue-list' }));
    expect(document.querySelector('[data-electric-mc="id-link"]')).toBeTruthy();
    featuresOff([f, recordRoles()], document);
    expect(document.querySelector('[data-electric-mc="id-link"]')).toBeNull();
  });
});

// The features moved out of the content script. Synthetic markup and names only.
import { clickBus } from '../lib/clickbus';
import { deliverStored, startFeatures, watchedKeys } from '../lib/features/feature';
import { flagLabels } from '../lib/features/flags';
import { eicList, today } from '../lib/features/eic';
import { versionHistory } from '../lib/features/versions';
import { aeAssignMenu } from '../lib/features/aemenu';
import { oneButtonReject } from '../lib/features/onebutton';
import { KEY } from '../lib/messages';
import { tabGet, tabSet } from '../lib/tabstate';

const MS = { id: 'XYZJ-26-09-9011', baseId: 'XYZJ-26-09-9011', revision: 0, title: 'This is a test!' };
const types = (send: ReturnType<typeof vi.fn>) => send.mock.calls.map(([m]) => (m as { type: string }).type);

describe('moved features', () => {
  it('collects watched keys and hands stored values only to the features that follow them', () => {
    const seen: string[] = [];
    const a: Feature = { id: 'a', watches: [KEY.flags, KEY.eic], onStored: (k) => seen.push(`a:${k}`), onPage() {} };
    const b: Feature = { id: 'b', watches: [KEY.eic], onStored: () => { throw new Error('boom'); }, onPage() {} };
    expect(watchedKeys([a, b, { id: 'c', onPage() {} }])).toEqual([KEY.flags, KEY.eic]);
    const send = vi.fn();
    deliverStored([a, b], { [KEY.eic]: {} }, null, send);
    expect(seen).toEqual([`a:${KEY.eic}`]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'feature failed' }));
  });

  it('starts each feature once and keeps going past one that throws', () => {
    const ok = vi.fn();
    const send = vi.fn();
    startFeatures([{ id: 'bad', start: () => { throw new Error('x'); }, onPage() {} }, { id: 'ok', start: ok, onPage() {} }], { doc: document, clicks: clickBus(document), current: () => null }, send);
    expect(ok).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it('learns flag labels from the panel and redraws when the stored map changes', () => {
    document.body.innerHTML = `<table><tr><td>Flag This Manuscript</td></tr><tr><td><input type="checkbox"><img src="/images/flags/star.png"> Invited submission</td></tr></table>
      <p>XYZJ-26-09-9012 <img src="/images/flags/star.png"></p>`;
    const f = flagLabels();
    const send = vi.fn();
    const c = { ...ctx({}, send), settings: { ...DEFAULT_SETTINGS, flagLabels: true } };
    f.onPage(c);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'flags', map: { 'star.png': 'Invited submission' } }));
    f.onStored!(KEY.flags, { [journalKeyHere()]: { 'star.png': 'Invited submission' } }, c);
    expect(document.querySelector('[data-electric-mc="flag-label"], [data-electric-mc]')?.textContent).toContain('flagged: Invited submission');
    f.off!(document);
    expect(document.body.textContent).not.toContain('flagged:');
  });

  it('keeps a submitted decision once MC answers with a new page, and drops one that is too old', () => {
    document.body.innerHTML = '';
    const f = eicList();
    const send = vi.fn();
    tabSet(window, 'submittedChoice', { id: MS.id, baseId: MS.baseId, site: 'xyzj', title: MS.title, recommendation: 'Reject', seen: today(), kind: 'decision', source: 'submit', at: Date.now() });
    f.onPage(ctx({ manuscript: MS } as Partial<ParseResult>, send));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'eic', set: expect.objectContaining({ recommendation: 'Reject', kind: 'decision' }) }));
    expect(tabGet(window, 'submittedChoice')).toBeNull();
    send.mockClear();
    tabSet(window, 'submittedChoice', { id: MS.id, at: Date.now() - 10 * 60_000 });
    f.onPage(ctx({ manuscript: MS } as Partial<ParseResult>, send));
    expect(types(send)).not.toContain('eic');
  });

  it('notes the choice at Submit only while on, and clears a recommendation once its letter went out', () => {
    document.body.innerHTML = `<table><tr><td><b>Co-Chair Recommends</b></td></tr><tr><td><input type="radio" name="r" id="rej" checked></td><td>Reject</td></tr>
      <tr><td><a href="#" id="submit">Submit</a></td></tr></table>`;
    const f = eicList();
    const bus = clickBus(document);
    let on: PageContext | null = null;
    f.start!({ doc: document, clicks: bus, current: () => on });
    document.getElementById('submit')!.click();
    expect(tabGet(window, 'submittedChoice')).toBeNull();
    on = ctx({ manuscript: MS, site: 'xyzj' } as Partial<ParseResult>);
    document.getElementById('submit')!.click();
    expect(tabGet<{ recommendation: string }>(window, 'submittedChoice')?.recommendation).toBe('Reject');
    sessionStorage.clear();
    bus.stop();
    const send = vi.fn();
    f.onStored!(KEY.eic, { [MS.id]: { id: MS.id, recommendation: 'Reject', source: 'submit' } }, null);
    f.onPage({ ...ctx({ manuscript: MS } as Partial<ParseResult>, send), letters: () => new Map([[MS.id, '2026-10-01']]) });
    expect(send).toHaveBeenCalledWith({ type: 'eic', remove: MS.id });
  });

  it('records this version once, and takes milestone rows away off a revision', () => {
    document.body.innerHTML = '<table><tr data-electric-mc="milestones"><td>x</td></tr></table>';
    const f = versionHistory();
    const send = vi.fn();
    const c = ctx({ manuscript: { ...MS, handlingEditor: 'Editor, Pat' }, manuscriptIds: [MS] } as unknown as Partial<ParseResult>, send);
    f.onPage(c);
    f.onPage(c);
    expect(send.mock.calls.filter(([m]) => (m as { type: string }).type === 'version-info')).toHaveLength(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'version-info', id: MS.id, ae: 'Editor, Pat' }));
    expect(document.querySelector('[data-electric-mc="milestones"]')).toBeNull();
  });

  it('records a letter sent for a manuscript on the page, once', () => {
    document.body.innerHTML = '';
    const f = versionHistory();
    const send = vi.fn();
    const c = { ...ctx({ manuscriptIds: [MS] } as unknown as Partial<ParseResult>, send), letters: () => new Map([[MS.id, '2026-10-01'], ['XYZJ-26-09-9999', '2026-10-02']]) };
    f.onPage(c);
    f.onPage(c);
    expect(send.mock.calls.map(([m]) => m)).toEqual([{ type: 'version-info', baseId: MS.baseId, id: MS.id, info: { id: MS.id, responded: '2026-10-01' }, source: 'page' }]);
  });

  it('sends the AE workloads from the pull-down once, and logs the menu status', () => {
    document.body.innerHTML = `<table><tr><td>Assign Associate Editor</td></tr><tr><td>Associate Editor:</td><td><select name="XIK_AE_ID">
      <option value="">Select...</option><option>Editor, Pat (3)</option><option>Editor, Robin (0)</option><option>Example, Sam (2)</option><option>Example, Lee (1)</option><option>Example, Kim (4)</option></select></td></tr></table>`;
    const f = aeAssignMenu();
    const send = vi.fn();
    f.onStored!(KEY.aeMenu, undefined, null);
    f.onPage(ctx({}, send));
    f.onPage(ctx({}, send));
    expect(types(send).filter((t) => t === 'ae-load')).toHaveLength(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'AE menu', data: expect.objectContaining({ status: 'off: no browser config' }) }));
    f.onStored!(KEY.team, { people: [] }, ctx({}, send));
    f.off!(document);
  });

  it('shows the one-button controls on a details page only when turned on, and notes a PDF opened', () => {
    document.body.innerHTML = `<table><tr><td>Associate Editor List</td></tr><tr><td><select name="XIK_WORKFLOW_ASSIGN_TO_1">
      <option value="">Select an AE (# Current Assignments)</option><option value="a">Editor, Pat (3)</option><option value="b">Co-Chair, Opinions (0)</option>
      </select> <a href="#" id="assign"><img src="/images/assign.gif" alt="Assign"></a></td></tr></table><a href="#" id="pdf">PDF</a>`;
    const f = oneButtonReject();
    const page = { pageType: 'manuscript', manuscript: MS } as Partial<ParseResult>;
    f.onPage({ ...ctx(page), reason: 'mutation' });
    expect(document.querySelector('[data-electric-mc="one-button"]')).toBeNull();
    const on = { ...ctx(page), settings: { ...DEFAULT_SETTINGS, oneButtonReject: true } };
    f.onPage(on);
    expect(document.querySelector('[data-electric-mc="one-button"]')).toBeTruthy();
    const bus = clickBus(document);
    f.start!({ doc: document, clicks: bus, current: () => on });
    document.getElementById('pdf')!.addEventListener('click', (e) => e.preventDefault());
    document.getElementById('pdf')!.click();
    bus.stop();
    sessionStorage.clear();
  });
});

function journalKeyHere(): string {
  return journalKey(location.href);
}
