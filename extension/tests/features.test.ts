// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { featuresOff, runFeatures, type Feature, type PageContext } from '../lib/features/feature';
import { queueMarks } from '../lib/features/queuemarks';
import { recordIdentity, recordRoles } from '../lib/features/recorders';
import { DEFAULT_SETTINGS } from '../lib/messages';
import type { ParseResult } from '../parsers/types';

const ctx = (result: Partial<ParseResult>, send = vi.fn()): PageContext => ({ doc: document, result: { breadcrumb: [], site: 'xyzj', pageType: 'unknown', ...result } as ParseResult, reason: 'load', settings: DEFAULT_SETTINGS, send });

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
