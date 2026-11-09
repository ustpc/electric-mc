// Keepalives, so MC doesn't log the person out for inactivity. MC's
// "+ Search" toggle in the breadcrumb bar posts a tiny request to the server
// (scholaroneAJAXServlet) and changes nothing else, so after 10 minutes with
// no keyboard or mouse activity in any MC tab we press it twice: open, then
// close again. Every tab shares the times of the last activity and the last
// keepalive (chrome.storage.local), so only one tab sends. After 48 hours
// without activity we stop, so an unattended computer is still logged out
// eventually. Off unless the person turns it on; Ctrl+Shift+K sends one now.

import { pageClick } from './click';
import { textOf } from './text';

export const IDLE_MS = 10 * 60_000;
export const GIVE_UP_MS = 48 * 60 * 60_000;

/** Whether to send a keepalive now, given the shared times. */
export function keepaliveDue(now: number, lastActivity: number, lastSent: number, idleMs = IDLE_MS, giveUpMs = GIVE_UP_MS): boolean {
  if (now - lastActivity >= giveUpMs) return false;
  return now - Math.max(lastActivity, lastSent) >= idleMs;
}

/** MC's "+ Search" toggle in the breadcrumb bar (not the form's Search button). */
export function findSearchToggle(doc: Document): HTMLElement | null {
  const bars = doc.querySelectorAll('.breadcrumb, ol, nav ul, [class*=breadcrumb]');
  for (const bar of Array.from(bars)) {
    const el = Array.from(bar.querySelectorAll<HTMLElement>('a, button')).find((e) => /^\+?\s*search$/i.test(textOf(e)));
    if (el) return el;
  }
  // Fallback: a link reading "+ Search" anywhere.
  return Array.from(doc.querySelectorAll<HTMLElement>('a, button')).find((e) => /^\+\s*search$/i.test(textOf(e))) ?? null;
}

/**
 * Press the toggle twice, 1.5 s apart, and report how many requests to MC's
 * server followed within 3 s (from the page's resource timing).
 */
export interface KeepaliveResult {
  found: boolean;
  requests: number;
  /** HTTP status of each request, where the browser reports it (0 = not reported). */
  statuses?: number[];
  /** Bytes received for each request; a sudden change can mean MC answered with a login page. */
  sizes?: number[];
}

export async function sendKeepalive(doc: Document): Promise<KeepaliveResult> {
  const toggle = findSearchToggle(doc);
  if (!toggle) return { found: false, requests: 0 };
  const view = doc.defaultView!;
  const start = view.performance.now();
  pageClick(toggle);
  await new Promise((r) => view.setTimeout(r, 1500));
  pageClick(toggle);
  await new Promise((r) => view.setTimeout(r, 1500));
  const entries = (view.performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(
    (e) => e.startTime >= start && /scholaroneAJAXServlet/i.test(e.name),
  );
  if (!entries.length) return { found: true, requests: 0 };
  return {
    found: true,
    requests: entries.length,
    statuses: entries.map((e) => (e as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? 0),
    sizes: entries.map((e) => e.transferSize ?? 0),
  };
}
