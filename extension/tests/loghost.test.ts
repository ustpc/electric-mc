// The live-log host (tools/log-host): fed Chrome's framing (4-byte length,
// then JSON), it answers with the file's path and appends one line per entry.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOST = join(__dirname, '..', 'tools', 'log-host', 'electric_mc_log_host.py');
const frame = (o: unknown) => {
  const body = Buffer.from(JSON.stringify(o), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
};

describe('log host', () => {
  it('replies with its file and appends each entry as a JSON line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'emc-log-'));
    try {
      const file = join(dir, 'sub', 'electric-mc.log');
      const entries = [{ ts: '2026-10-27T00:00:00Z', level: 'info', event: 'synthetic one' }, { level: 'warn', event: 'naïve «two»' }];
      const r = spawnSync('python3', [HOST, file], { input: Buffer.concat(entries.map(frame)) });
      expect(r.status).toBe(0);
      const out = r.stdout as Buffer;
      expect(JSON.parse(out.subarray(4, 4 + out.readUInt32LE(0)).toString('utf8'))).toEqual({ ok: true, path: file });
      expect(readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))).toEqual(entries);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
