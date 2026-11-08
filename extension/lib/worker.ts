// Background promises that may outlive the service worker.

/**
 * Chrome's own message when an API call is still in flight as the service
 * worker is replaced (an update or reload). It isn't a bug in our code, and
 * the new worker redoes the work, so it is dropped (0.0.65).
 */
export function isWorkerGone(e: unknown): boolean {
  return /\bNo SW\b|Extension context invalidated|No tab with id|No window with id/i.test(String((e as Error)?.message ?? e));
}

/** Run a promise in the background: a worker-gone error is dropped, anything else is logged. */
export function bg(p: Promise<unknown> | unknown): void {
  if (p instanceof Promise) p.catch((e: unknown) => (isWorkerGone(e) ? undefined : console.error('[electric-mc]', e)));
}

