// @vitest-environment jsdom
// Linkage: messages from content scripts and the side panel reach the
// background's handlers and end up in storage. A fake chrome; synthetic data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePage } from '../parsers';
import type { Msg } from '../lib/messages';
import { fakeChrome, until } from './fakechrome';

vi.mock('wxt/utils/define-background', () => ({ defineBackground: (main: () => void) => main }));

let env: ReturnType<typeof fakeChrome>;

async function boot(permissions: string[] = []) {
  vi.resetModules();
  env = fakeChrome({ permissions });
  vi.stubGlobal('chrome', env.chrome);
  const main = (await import('../entrypoints/background')).default as unknown as () => void;
  main();
}

function send(msg: Msg, tab?: number): Promise<unknown> {
  return new Promise((reply) => {
    const listener = env.onMessage.listeners[0] as (m: Msg, s: { tab?: { id: number } }, r: (x: unknown) => void) => boolean;
    const async = listener(msg, tab === undefined ? {} : { tab: { id: tab } }, reply);
    if (!async) setTimeout(() => reply(undefined), 0);
  });
}

const local = () => env.storage.local.data as Record<string, any>;

beforeEach(async () => {
  await boot();
});

describe('background linkage', () => {
  it('keeps each tab\'s parse and adds the manuscript to Seen', async () => {
    const html = readFileSync(join(__dirname, 'fixtures', 'manuscript.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mc.manuscriptcentral.com/cacm' });
    const result = parsePage(dom.window.document, 'https://mc.manuscriptcentral.com/cacm');
    expect(result.manuscript).toBeTruthy();
    await send({ type: 'parsed', result, reason: 'load', title: 't' }, 7);
    await until(() => !!local().seen?.[result.manuscript!.baseId]);
    expect((env.storage.session.data['tab:7'] as { result: { pageType: string } }).result.pageType).toBe('manuscript');
    expect(local().seen[result.manuscript!.baseId]).toMatchObject({ latestId: result.manuscript!.id });
  });

  it('applies note changes from the side panel in order, without losing any', async () => {
    const note = (t: number, text: string) => ({ m: 'XYZJ-26-09-9011', t, email: 'a@example.org', author: 'A', text, updated: t });
    const replies = await Promise.all([
      send({ type: 'notes', m: 'XYZJ-26-09-9011', op: { op: 'upsert', note: note(1, 'one') } }),
      send({ type: 'notes', m: 'XYZJ-26-09-9011', op: { op: 'upsert', note: note(2, 'two') } }),
      send({ type: 'notes', m: 'XYZJ-26-09-9011', op: { op: 'upsert', note: note(3, 'three') } }),
    ]);
    expect(replies).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(local().notes['XYZJ-26-09-9011'].map((n: { text: string }) => n.text)).toEqual(['one', 'two', 'three']);
    await send({ type: 'notes', m: 'XYZJ-26-09-9011', op: { op: 'remove', t: 2, email: 'a@example.org' } });
    expect(local().notes['XYZJ-26-09-9011'].map((n: { text: string }) => n.text)).toEqual(['one', 'three']);
  });

  it('remembers roles, identity, flags and the To EIC list', async () => {
    await send({ type: 'roles', site: 'xyzj', roles: ['coChair'] });
    await send({ type: 'identity', site: 'xyzj', identity: { email: 'a@example.org', firstName: 'Pat', lastName: 'Editor' } });
    await send({ type: 'flags', journal: 'xyzj', map: { 'flag_red.gif': 'synthetic label' } });
    await send({ type: 'eic', set: { id: 'XYZJ-26-09-9011', baseId: 'XYZJ-26-09-9011', site: 'xyzj', recommendation: 'Reject', seen: '2026-11-19' } });
    await until(() => !!local().eic?.['XYZJ-26-09-9011'] && !!local().flags && !!local().identity);
    expect(local().identity.xyzj.email).toBe('a@example.org');
    await until(() => !!local().roles?.xyzj?.coChair);
    expect(local().flags.xyzj).toBeTruthy();
    await send({ type: 'eic', remove: 'XYZJ-26-09-9011' });
    await until(() => !local().eic['XYZJ-26-09-9011']);
  });

  it('logs only problems outside developer mode', async () => {
    await send({ type: 'log', level: 'info', event: 'quiet one' }, 1);
    await send({ type: 'log', level: 'warn', event: 'a problem' }, 1);
    await until(() => (local().log ?? []).length > 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(local().log.map((e: { event: string }) => e.event)).toEqual(['a problem']);
  });

  it('never saves page samples in the Web Store build', async () => {
    env.storage.sync.data.settings = { developer: true };
    await send({ type: 'page-sample', name: 'ASSOCIATE_EDITOR_DASHBOARD', url: 'https://mc.manuscriptcentral.com/xyzj', html: '<p>x</p>' }, 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(local().pageSamples).toBeUndefined();
  });

  it('learns probes per MC page and logs when MC changed one', async () => {
    for (let i = 0; i < 20; i++) await send({ type: 'probes', page: 'ASSOCIATE_EDITOR_ASSIGN', results: { aeSelect: true } }, 1);
    for (let i = 0; i < 3; i++) await send({ type: 'probes', page: 'ASSOCIATE_EDITOR_ASSIGN', results: { aeSelect: false } }, 1);
    await until(() => (local().log ?? []).some((e: { event: string }) => e.event === 'MC changed'));
    expect(local().probes.ASSOCIATE_EDITOR_ASSIGN.aeSelect).toMatchObject({ pass: 20, fail: 3, failStreak: 3 });
  });

  it('turns the site off and on from the toolbar menu', async () => {
    const menu = (env.chrome as unknown as { contextMenus: { onClicked: { listeners: Array<(i: unknown, t: unknown) => void> } } }).contextMenus.onClicked.listeners[0]!;
    menu({ menuItemId: 'toggle-site' }, { url: 'https://mc.manuscriptcentral.com/xyzj' });
    await until(() => !!(env.storage.sync.data.settings as { disabledHosts?: string[] } | undefined)?.disabledHosts?.length);
    expect((env.storage.sync.data.settings as { disabledHosts: string[] }).disabledHosts).toEqual(['mc.manuscriptcentral.com']);
  });
});
