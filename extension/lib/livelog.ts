// Live log file, for developers. In Developer mode, test builds send each
// log entry to a small helper on the person's own computer (Chrome "native
// messaging"), which appends it to a file. Chrome starts the helper when we
// connect and stops it when the port closes. The helper is registered with
// `make install-log-host`; see tools/log-host/. Store builds don't have the
// nativeMessaging permission, so connectNative is missing there and this
// does nothing.

import type { LogEntry } from './log';

export const LOG_HOST = 'org.electric_mc.log';

type Connect = (host: string) => chrome.runtime.Port;

export interface LiveLog {
  send(entry: LogEntry): void;
  /** Why the helper can't be reached, once it has failed to start. */
  readonly problem: string | null;
}

/**
 * Sends entries to the helper, reconnecting on the next entry after the port
 * closes. If the helper isn't installed, it stops trying until `retryMs` has
 * passed, so a missing helper costs one failed connect per interval.
 */
export function createLiveLog(connect: Connect | undefined, lastError: () => string | undefined, retryMs = 60_000, now = Date.now): LiveLog {
  let port: chrome.runtime.Port | null = null;
  let problem: string | null = null;
  let failedAt = 0;
  const open = (): chrome.runtime.Port | null => {
    if (!connect) return null;
    if (problem && now() - failedAt < retryMs) return null;
    try {
      const p = connect(LOG_HOST);
      const opened = now();
      p.onDisconnect.addListener(() => {
        const err = lastError();
        if (port === p) port = null;
        // A port that closes at once, with an error, means the helper didn't start.
        if (err && now() - opened < 2_000) {
          problem = err;
          failedAt = now();
        }
      });
      problem = null;
      return p;
    } catch (e) {
      problem = (e as Error).message;
      failedAt = now();
      return null;
    }
  };
  return {
    send(entry) {
      port ??= open();
      if (!port) return;
      try {
        port.postMessage(entry);
      } catch {
        port = null;
      }
    },
    get problem() {
      return problem;
    },
  };
}
