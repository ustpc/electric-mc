// Serial queues: tasks run one at a time in order, a failure doesn't stop
// the queue, and a task may wait on another queue (the log) without hanging.
import { describe, expect, it } from 'vitest';
import { makeQueue } from '../lib/queue';

const tick = () => new Promise((r) => setTimeout(r, 1));

describe('makeQueue', () => {
  it('runs tasks one at a time, in order', async () => {
    const q = makeQueue();
    const seen: string[] = [];
    const task = (name: string) => q(async () => {
      seen.push(`${name} start`);
      await tick();
      seen.push(`${name} end`);
    });
    await Promise.all([task('a'), task('b')]);
    expect(seen).toEqual(['a start', 'a end', 'b start', 'b end']);
  });

  it('keeps going after a task fails', async () => {
    const q = makeQueue();
    await expect(q(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(q(async () => 'next')).resolves.toBe('next');
  });

  it('lets a data task wait on the log queue', async () => {
    const data = makeQueue();
    const log = makeQueue();
    const logged: string[] = [];
    const result = await Promise.race([
      data(async () => {
        await log(async () => { logged.push('roles learned'); });
        return 'done';
      }),
      new Promise((r) => setTimeout(() => r('hung'), 200)),
    ]);
    expect(result).toBe('done');
    expect(logged).toEqual(['roles learned']);
  });
});
