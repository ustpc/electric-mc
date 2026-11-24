// MC's own logout timer. Each MC page starts a countdown when it loads
// (div#sessionTimeoutBehaviour: data-session-timeout-millis, about 178
// minutes, with a warning 10 minutes before) and logs the person out "due to
// inactivity" when it runs out, however recently the server heard from the
// page. So a keepalive (lib/keepalive.ts) keeps the server session alive but
// not the page: the log showed logouts exactly 178 minutes after the last
// page load, with every keepalive in between answered.
//
// In the page's world (entrypoints/page-click.content.ts), timers of 30
// minutes or more are noted as the page sets them; after a keepalive MC
// answered, the content script asks for them to be started again from now,
// as a page load would. Shorter timers are never touched.

/** Asks the page's world to restart MC's long timers (content script -> page). */
export const RESTART_EVENT = 'emc-restart-page-timers';
/** How many timers were restarted, written back on <html> (page -> content script). */
export const RESTARTED_ATTR = 'data-emc-timers-restarted';
export const LONG_MS = 30 * 60_000;

interface Pending {
  handler: TimerHandler;
  args: unknown[];
  delay: number;
}

type TimerWindow = Pick<Window, 'setTimeout' | 'clearTimeout'>;

/**
 * Wrap the window's setTimeout so long timers are noted. Returns restart(),
 * which starts each pending long timer again with its full delay and returns
 * how many it restarted.
 */
export function watchLongTimers(win: TimerWindow, longMs = LONG_MS): { restart: () => number; pending: () => number } {
  const pending = new Map<number, Pending>();
  const set = win.setTimeout.bind(win);
  const clear = win.clearTimeout.bind(win);
  const track = (handler: TimerHandler, delay: number, args: unknown[]): number => {
    let id = 0;
    const run = typeof handler === 'function'
      ? (...a: unknown[]) => {
          pending.delete(id);
          (handler as (...x: unknown[]) => void)(...a);
        }
      : handler;
    id = set(run as TimerHandler, delay, ...args);
    if (typeof handler === 'function') pending.set(id, { handler, args, delay });
    return id;
  };
  win.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    const d = Number(delay) || 0;
    return d >= longMs ? track(handler, d, args) : set(handler, d, ...args);
  }) as typeof win.setTimeout;
  win.clearTimeout = ((id?: number) => {
    if (id !== undefined) pending.delete(id);
    clear(id);
  }) as typeof win.clearTimeout;
  // A restarted timer keeps its old id for the page (MC may clear it by that id).
  const alias = new Map<number, number>();
  const restart = () => {
    const now = [...pending.entries()];
    for (const [id, p] of now) {
      clear(alias.get(id) ?? id);
      pending.delete(id);
      const fresh = set(() => {
        pending.delete(id);
        alias.delete(id);
        (p.handler as (...x: unknown[]) => void)(...p.args);
      }, p.delay);
      alias.set(id, fresh);
      pending.set(id, p);
    }
    return now.length;
  };
  const origClear = win.clearTimeout;
  win.clearTimeout = ((id?: number) => {
    if (id !== undefined && alias.has(id)) {
      clear(alias.get(id));
      alias.delete(id);
    }
    origClear(id);
  }) as typeof win.clearTimeout;
  return { restart, pending: () => pending.size };
}
