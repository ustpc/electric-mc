import { describe, expect, it, vi } from 'vitest';
import { bg, isWorkerGone } from '../lib/worker';

describe('isWorkerGone', () => {
  it("recognizes Chrome's errors when the worker or tab is gone", () => {
    expect(isWorkerGone(new Error('No SW'))).toBe(true);
    expect(isWorkerGone(new Error('Extension context invalidated.'))).toBe(true);
    expect(isWorkerGone(new Error('No tab with id: 12.'))).toBe(true);
    expect(isWorkerGone(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});

describe('bg', () => {
  it('drops worker-gone rejections and logs others', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    bg(Promise.reject(new Error('No SW')));
    bg(Promise.reject(new Error('real bug')));
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
