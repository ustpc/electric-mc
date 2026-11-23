// @vitest-environment jsdom
// The Back-link experiment: synthetic pages only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { differing, hiddenFields, keepsOwnValue, linkKind, looksLikeError, readLatest, swapInLatest } from '../lib/backexp';
import { backLinkExperiment } from '../lib/features/backexp';
import { clickBus } from '../lib/clickbus';
import { DEFAULT_SETTINGS } from '../lib/messages';
import { parseManuscriptId } from '../lib/ids';
import type { PageContext } from '../lib/features/feature';
import type { ParseResult } from '../parsers/types';

const PAGE = (page: string, token: string, extra = '') => `<form><input type="hidden" name="CURRENT_PAGE" value="${page}">
  <input type="hidden" name="PAGE_TOKEN" value="${token}"><input type="hidden" name="XIK_TAGACT" value="">
  <input type="hidden" name="SESSION_HASH" value="h-${token}"></form>
  <a href="#" id="ms" onclick="return false">XYZJ-26-09-9011</a> <a href="#" id="q">Awaiting AE Assignment</a> ${extra}`;

const isId = (s: string) => !!parseManuscriptId(s);

afterEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '';
});

describe('helpers', () => {
  it('reads hidden fields, keeps the page and action fields, and swaps the rest', () => {
    document.body.innerHTML = PAGE('ASSOCIATE_EDITOR_VIEW_MANUSCRIPTS', 't1');
    const saved = hiddenFields(document);
    expect(Object.keys(saved)).toEqual(['CURRENT_PAGE', 'PAGE_TOKEN', 'XIK_TAGACT', 'SESSION_HASH']);
    const latest = { CURRENT_PAGE: 'ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS', PAGE_TOKEN: 't2', XIK_TAGACT: 'x', SESSION_HASH: 'h-t2' };
    expect(differing(saved, latest)).toEqual(['CURRENT_PAGE', 'PAGE_TOKEN', 'SESSION_HASH', 'XIK_TAGACT']);
    expect(keepsOwnValue('CURRENT_PAGE') && keepsOwnValue('XIK_ANYTHING') && !keepsOwnValue('PAGE_TOKEN')).toBe(true);
    expect(swapInLatest(document, latest)).toEqual(['PAGE_TOKEN', 'SESSION_HASH']);
    expect(hiddenFields(document)).toMatchObject({ CURRENT_PAGE: 'ASSOCIATE_EDITOR_VIEW_MANUSCRIPTS', PAGE_TOKEN: 't2', XIK_TAGACT: '' });
  });

  it('names the kind of link without keeping its text, and spots error pages', () => {
    document.body.innerHTML = PAGE('X', 't') + '<a id="t">Make Recommendation</a><a id="d">Co-Chair Dashboard</a><a id="o">Help</a>';
    const k = (id: string) => linkKind(document.getElementById(id)!, isId);
    expect([k('ms'), k('q'), k('t'), k('d'), k('o')]).toEqual(['manuscript', 'queue', 'task', 'dashboard', 'other']);
    expect(looksLikeError(document)).toBe(false);
    document.body.innerHTML = '<p>An error has occurred. Please try again.</p>';
    expect(looksLikeError(document)).toBe(true);
  });
});

describe('the experiment', () => {
  const ctx = (reason: string, page: Partial<ParseResult>, send = vi.fn(), on = true): PageContext => ({
    doc: document,
    result: { breadcrumb: [], site: 'xyzj', pageType: 'queue-list', ...page } as ParseResult,
    reason,
    settings: { ...DEFAULT_SETTINGS, developer: true, backLinkExperiment: on },
    send,
    letters: () => new Map(),
    get: () => Promise.resolve(undefined),
  });
  const events = (send: ReturnType<typeof vi.fn>) => send.mock.calls.map(([m]) => (m as { event?: string }).event);

  it('does nothing while off', () => {
    document.body.innerHTML = PAGE('A', 't1');
    const send = vi.fn();
    backLinkExperiment().onPage(ctx('bfcache', {}, send, false));
    expect(send).not.toHaveBeenCalled();
    expect(document.querySelector('[data-electric-mc="backexp"]')).toBeNull();
  });

  it('notes the latest live page, marks a page shown by Back, logs a press with swapped tokens, then MC\'s answer', () => {
    // A live page: its hidden fields are kept for later.
    document.body.innerHTML = PAGE('ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS', 't2');
    const live = backLinkExperiment();
    const send = vi.fn();
    live.onPage(ctx('load', { pageType: 'manuscript' }, send));
    expect(readLatest(document)?.page).toBe('ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS');
    expect(events(send)).toEqual(['back-exp page']);

    // Back brings up the queue page from the cache.
    document.body.innerHTML = PAGE('ASSOCIATE_EDITOR_VIEW_MANUSCRIPTS', 't1');
    const back = backLinkExperiment();
    const c = ctx('bfcache', {}, send);
    back.start!({ doc: document, clicks: clickBus(document), current: () => c });
    back.onPage(c);
    const bar = document.querySelector('[data-electric-mc="backexp"]')!;
    expect(bar.textContent).toContain('2 of its tokens differ');
    // Choose the latest page's tokens, then press the manuscript link.
    const radios = bar.querySelectorAll<HTMLInputElement>('input[type=radio]');
    radios[1]!.checked = true;
    radios[1]!.dispatchEvent(new Event('change'));
    document.getElementById('ms')!.click();
    const press = send.mock.calls.map(([m]) => m).find((m) => m.event === 'back-exp press');
    expect(press.data).toMatchObject({ n: 1, variant: 'latest', from: 'ASSOCIATE_EDITOR_VIEW_MANUSCRIPTS', kind: 'manuscript', swapped: ['PAGE_TOKEN', 'SESSION_HASH'] });
    // The log holds names only, never values.
    expect(JSON.stringify(press)).not.toMatch(/t2|h-t2|XYZJ/);

    // MC answers with a live page: the result is logged once.
    document.body.innerHTML = PAGE('ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS', 't3');
    const next = backLinkExperiment();
    next.onPage(ctx('load', { pageType: 'manuscript' }, send));
    const result = send.mock.calls.map(([m]) => m).find((m) => m.event === 'back-exp result');
    expect(result.data).toMatchObject({ n: 1, variant: 'latest', kind: 'manuscript', page: 'ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS', loggedOut: false, error: false });
    next.onPage(ctx('load', { pageType: 'manuscript' }, send));
    expect(events(send).filter((e) => e === 'back-exp result')).toHaveLength(1);
  });
});
