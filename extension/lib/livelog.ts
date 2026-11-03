// Live log: in developer mode, test builds also send every log entry to a
// small program on the computer (tools/log-host), which appends it to a
// file. The background worker opens one native-messaging port; Chrome
// starts the program for it and stops it when the port closes (or the
// worker stops). The first reply names the file. If the program isn't
// installed, Chrome closes the port at once; we note why and try again only
// after a while. Its state is kept in session storage for the Log tab.

export const HOST = 'org.electric_mc.log';
export const LIVE_LOG_KEY = 'liveLog';
const RETRY_MS = 5 * 60_000;

export interface LiveLogState {
  state: 'writing' | 'unavailable';
  path?: string;
  error?: string;
  at: string;
}

let port: chrome.runtime.Port | null = null;
let failedAt = 0;

function setState(s: Omit<LiveLogState, 'at'>) {
  void chrome.storage.session.set({ [LIVE_LOG_KEY]: { ...s, at: new Date().toISOString() } }).catch(() => {});
}

function open(): chrome.runtime.Port | null {
  if (port) return port;
  if (!chrome.runtime.connectNative || Date.now() - failedAt < RETRY_MS) return null;
  try {
    const p = chrome.runtime.connectNative(HOST);
    p.onMessage.addListener((m: { ok?: boolean; path?: string }) => {
      if (m?.ok) setState({ state: 'writing', path: m.path });
    });
    p.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      if (port === p) port = null;
      // Closed with an error: not installed, or it crashed. Wait before trying again.
      if (error) {
        failedAt = Date.now();
        setState({ state: 'unavailable', error });
      }
    });
    port = p;
    return p;
  } catch (e) {
    failedAt = Date.now();
    setState({ state: 'unavailable', error: String(e) });
    return null;
  }
}

/** Send one log entry to the live log file, if the host is installed. */
export function liveLog(entry: object): void {
  try {
    open()?.postMessage(entry);
  } catch {
    port = null;
  }
}

/** Close the port, so the host exits (developer mode turned off). */
export function closeLiveLog(): void {
  port?.disconnect();
  port = null;
}
