// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://mc.manuscriptcentral.com/xyzj"}
// Linkage: the content script on a synthetic MC page. It parses the page and
// tells the background, and its click listeners run in the right order (the
// no-choice guard stops a Submit before the submit recorder notes it).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEY, type Msg } from '../lib/messages';
import { journalKey } from '../lib/aeload';
import { fakeChrome, until } from './fakechrome';

vi.mock('wxt/utils/define-content-script', () => ({ defineContentScript: (o: unknown) => o }));

const FORM = `<div><table><tr><td>Manuscript ID:</td><td>XYZJ-26-09-9011</td></tr><tr><td>Title:</td><td>This is a test!</td></tr></table>
  <p>AE: <a href="#">Editor, Pat</a></p>
  <table><tr><td><b>Associate Editor Recommends</b></td></tr>
  <tr><td><input type="radio" name="r" id="acc"></td><td>Accept</td></tr>
  <tr><td><input type="radio" name="r" id="rej"></td><td>Reject</td></tr>
  <tr><td><textarea name="T1_REVIEWER_COMMENTS_TO_AUTHOR">Synthetic comment.</textarea></td></tr>
  <tr><td><a href="#" id="submit">Submit</a></td></tr></table></div>`;

let env: ReturnType<typeof fakeChrome>;
const sent = () => (env.chrome as unknown as { runtime: { sendMessage: { mock: { calls: Msg[][] } } } }).runtime.sendMessage.mock.calls.map((c) => c[0]!);

async function boot(html: string) {
  vi.resetModules();
  document.documentElement.innerHTML = html;
  sessionStorage.clear();
  env = fakeChrome();
  vi.stubGlobal('chrome', env.chrome);
  vi.stubGlobal('MutationObserver', TrackedObserver);
  const script = (await import('../entrypoints/content')).default as unknown as { main: () => void };
  script.main();
  await until(() => sent().some((m) => m.type === 'parsed'));
}

// Each boot leaves a content script watching the page; stop them between tests.
const observers: MutationObserver[] = [];
class TrackedObserver extends MutationObserver {
  constructor(cb: MutationCallback) {
    super(cb);
    observers.push(this);
  }
}
afterEach(() => {
  observers.splice(0).forEach((o) => o.disconnect());
  vi.unstubAllGlobals();
});

describe('content script linkage', () => {
  it('parses the page and sends the result to the background', async () => {
    const html = readFileSync(join(__dirname, 'fixtures', 'manuscript.html'), 'utf8');
    await boot(html.replace(/^[\s\S]*?<html[^>]*>/i, '').replace(/<\/html>\s*$/i, ''));
    const parsed = sent().find((m) => m.type === 'parsed') as Extract<Msg, { type: 'parsed' }>;
    expect(parsed.result.pageType).toBe('manuscript');
    expect(parsed.reason).toBe('load');
  });

  it('stops a Submit with no choice before anything notes it, and notes one with a choice', async () => {
    await boot(`<head><title>t</title></head><body>${FORM}<form><input type="hidden" name="CURRENT_PAGE" value="ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS"></form></body>`);
    const submit = document.getElementById('submit')!;
    const click = () => submit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(click()).toBe(false); // prevented by the guard
    expect(document.body.textContent).toContain('pick one of the choices');
    expect(sessionStorage.getItem('emc-submitted-choice')).toBeNull();
  });

  it('notes a Submit that has a choice, after the guards let it through', async () => {
    await boot(`<head><title>t</title></head><body>${FORM}<form><input type="hidden" name="CURRENT_PAGE" value="ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS"></form></body>`);
    const parsed = sent().find((m) => m.type === 'parsed') as Extract<Msg, { type: 'parsed' }>;
    expect(parsed.result.manuscript?.id).toBe('XYZJ-26-09-9011');
    (document.getElementById('rej') as HTMLInputElement).checked = true;
    const submit = document.getElementById('submit')!;
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(JSON.parse(sessionStorage.getItem('emc-submitted-choice') ?? 'null')).toMatchObject({ id: 'XYZJ-26-09-9011', recommendation: 'Reject', source: 'submit' });
  });

  it('hands a stored flag map to the page and takes its marks away when switched off for the site', async () => {
    const page = `<head><title>t</title></head><body><table><tr><td>Manuscript ID</td><td>Status</td></tr><tr><td>XYZJ-26-09-9012 <img src="/images/flags/star.png"></td><td>x</td></tr></table></body>`;
    await boot(page);
    await env.storage.sync.set({ [KEY.settings]: { flagLabels: true } });
    await until(() => sent().filter((m) => m.type === 'parsed').length >= 2);
    await env.storage.local.set({ [KEY.flags]: { [journalKey(location.href)]: { 'star.png': 'Invited submission' } } });
    expect(document.body.textContent).toContain('flagged: Invited submission');
    await env.storage.sync.set({ [KEY.settings]: { flagLabels: true, disabledHosts: [location.hostname] } });
    await until(() => sent().some((m) => m.type === 'disabled'));
    expect(document.body.textContent).not.toContain('flagged:');
  });

  it('answers the side panel: ping, reparse and abstract', async () => {
    await boot(`<head><title>t</title></head><body>${FORM}</body>`);
    const listener = env.onMessage.listeners[0] as unknown as (m: Msg, s: unknown, reply: (x: unknown) => void) => boolean;
    const replies: unknown[] = [];
    listener({ type: 'ping' } as Msg, {}, (x) => replies.push(x));
    listener({ type: 'reparse' } as Msg, {}, (x) => replies.push(x));
    listener({ type: 'abstract' } as Msg, {}, (x) => replies.push(x));
    expect(replies[0]).toEqual({ version: '0.0.0' });
    expect(replies[1]).toEqual({ ok: true });
    expect(replies).toHaveLength(3);
    expect(sent().some((m) => m.type === 'parsed' && m.reason === 'manual')).toBe(true);
  });
});
