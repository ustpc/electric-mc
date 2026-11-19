// A small in-memory `chrome` for linkage tests: real storage areas
// (get/set/remove, onChanged), captured event listeners, a manifest, and a
// quiet stub for every other call (resolves, or calls its callback).
import { vi } from 'vitest';

type Listener = (...a: never[]) => unknown;

function area(name: string, changed: (ch: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void) {
  const data: Record<string, unknown> = {};
  const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
  return {
    data,
    get: (keys?: string | string[] | null) => {
      const list = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      return Promise.resolve(Object.fromEntries(list.filter((k) => k in data).map((k) => [k, clone(data[k])])));
    },
    set: (items: Record<string, unknown>) => {
      const ch: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        ch[k] = { oldValue: data[k], newValue: clone(v) };
        data[k] = clone(v);
      }
      changed(ch, name);
      return Promise.resolve();
    },
    remove: (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
      return Promise.resolve();
    },
  };
}

function event() {
  const listeners: Listener[] = [];
  return { listeners, addListener: (f: Listener) => listeners.push(f), removeListener: () => {}, hasListener: () => false };
}

/** A stub that answers any property with another stub, and any call with a resolved promise. */
function stub(): unknown {
  const fn = (...args: unknown[]) => {
    const cb = args.find((a) => typeof a === 'function') as ((x?: unknown) => void) | undefined;
    if (cb) cb();
    return Promise.resolve(undefined);
  };
  return new Proxy(fn, {
    get: (_t, p) => (p === 'then' ? undefined : /^on[A-Z]/.test(String(p)) ? event() : stub()),
  });
}

export function fakeChrome(manifest: { version?: string; name?: string; permissions?: string[] } = {}) {
  const onChanged = event();
  const changed = (ch: Record<string, unknown>, a: string) => onChanged.listeners.forEach((f) => (f as (c: unknown, a: string) => void)(ch, a));
  const storage = { local: area('local', changed), sync: area('sync', changed), session: area('session', changed), onChanged };
  const onMessage = event();
  const runtime = {
    id: 'test',
    lastError: undefined,
    onMessage,
    onInstalled: event(),
    getManifest: () => ({ version: '0.0.0', name: 'Electric MC', permissions: [], ...manifest }),
    sendMessage: vi.fn(() => Promise.resolve(undefined)),
    connectNative: undefined,
  };
  const filled = <T extends object>(o: T): T => new Proxy(o as Record<string, unknown>, { get: (t, p: string) => (p in t ? t[p] : ((t[p] = /^on[A-Z]/.test(p) ? event() : stub()), t[p])) }) as T;
  const base = { storage, runtime: filled(runtime), tabs: filled({ get: () => Promise.resolve(undefined), query: () => Promise.resolve([]) }), contextMenus: filled({}) };
  const chrome = filled(base);
  return { chrome, storage, onMessage };
}

/** Wait until `done()` holds (the background works through promise queues). */
export async function until(done: () => boolean, ms = 1000): Promise<void> {
  const end = Date.now() + ms;
  while (!done()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
}
