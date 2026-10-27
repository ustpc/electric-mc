import { describe, expect, it } from 'vitest';
import { createLiveLog, LOG_HOST } from '../lib/livelog';
import type { LogEntry } from '../lib/log';
// @ts-expect-error plain JavaScript helper, run by Chrome under node
import { makeReader, append } from '../tools/log-host/log-host.mjs';
// @ts-expect-error plain JavaScript helper
import { unpackedId } from '../tools/log-host/extension-id.mjs';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const entry = (event: string): LogEntry => ({ ts: '2026-01-01T00:00:00Z', level: 'info', source: 'background', event });

function fakePort() {
  const sent: unknown[] = [];
  const listeners: Array<() => void> = [];
  const port = {
    postMessage: (m: unknown) => sent.push(m),
    onDisconnect: { addListener: (f: () => void) => listeners.push(f) },
  } as unknown as chrome.runtime.Port;
  return { port, sent, disconnect: () => listeners.forEach((f) => f()) };
}

describe('live log', () => {
  it('does nothing without native messaging (store builds)', () => {
    const live = createLiveLog(undefined, () => undefined);
    live.send(entry('a'));
    expect(live.problem).toBeNull();
  });

  it('connects once and sends every entry', () => {
    const p = fakePort();
    const hosts: string[] = [];
    const live = createLiveLog((h) => (hosts.push(h), p.port), () => undefined);
    live.send(entry('a'));
    live.send(entry('b'));
    expect(hosts).toEqual([LOG_HOST]);
    expect(p.sent).toHaveLength(2);
  });

  it('reconnects after the helper stops', () => {
    let t = 0;
    const ports = [fakePort(), fakePort()];
    let n = 0;
    const live = createLiveLog(() => ports[n++]!.port, () => undefined, 60_000, () => t);
    live.send(entry('a'));
    t = 10_000;
    ports[0]!.disconnect();
    live.send(entry('b'));
    expect(n).toBe(2);
    expect(ports[1]!.sent).toHaveLength(1);
  });

  it('backs off when the helper is not installed', () => {
    let t = 0;
    let tries = 0;
    let err: string | undefined;
    const ports: ReturnType<typeof fakePort>[] = [];
    const live = createLiveLog(() => {
      tries++;
      const p = fakePort();
      ports.push(p);
      return p.port;
    }, () => err, 60_000, () => t);
    live.send(entry('a'));
    err = 'Specified native messaging host not found.';
    ports[0]!.disconnect();
    expect(live.problem).toMatch(/not found/);
    t = 30_000;
    live.send(entry('b'));
    expect(tries).toBe(1);
    t = 61_000;
    live.send(entry('c'));
    expect(tries).toBe(2);
  });
});

describe('log helper', () => {
  it('splits length-prefixed messages, even across chunks', () => {
    const got: string[] = [];
    const read = makeReader((m: string) => got.push(m));
    const frame = (s: string) => {
      const b = Buffer.from(s);
      const h = Buffer.alloc(4);
      h.writeUInt32LE(b.length);
      return Buffer.concat([h, b]);
    };
    const all = Buffer.concat([frame('{"a":1}'), frame('{"b":"é"}')]);
    read(all.subarray(0, 6));
    read(all.subarray(6));
    expect(got).toEqual(['{"a":1}', '{"b":"é"}']);
  });

  it('appends one JSON line per entry', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'emc-')), 'sub', 'log');
    append(file, JSON.stringify(entry('a')));
    append(file, 'not json');
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[0].event).toBe('a');
    expect(lines[1].event).toBe('unreadable message');
  });

  it('computes the unpacked extension ID as Chrome does', () => {
    const id = unpackedId('/Users/someone/electric-mc/extension/build/chrome-mv3');
    expect(id).toMatch(/^[a-p]{32}$/);
  });
});
