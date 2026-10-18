// Messages between the content script, background and side panel, and the
// storage keys they share.

import type { ParseResult } from '../parsers/types';
import type { Level } from './log';

export type Msg =
  | { type: 'parsed'; result: ParseResult; reason: string; title: string | null }
  | { type: 'log'; level: Level; event: string; data?: unknown }
  | { type: 'disabled' }
  // Side panel → content script (via tabs.sendMessage)
  | { type: 'reparse' }
  | { type: 'capture' };

export interface CaptureReply {
  url: string;
  title: string;
  html: string;
  result: ParseResult;
}

export interface Settings {
  overlay: boolean;
  rewriteTitle: boolean;
  /** Log every debounced re-parse, not just ones that changed something. */
  verbose: boolean;
  idPattern?: string;
  /** Hostnames where the extension does nothing. */
  disabledHosts: string[];
  /** Press "Log In" once a password manager has filled the login form. */
  autoSubmitLogin: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  overlay: false,
  rewriteTitle: true,
  verbose: false,
  disabledHosts: [],
  autoSubmitLogin: true,
};

export function isEnabledFor(s: Settings, url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return /(^|\.)manuscriptcentral\.com$/.test(u.hostname) && !s.disabledHosts.includes(u.hostname);
  } catch {
    return false;
  }
}

export async function setHostEnabled(host: string, enabled: boolean): Promise<void> {
  const s = await getSettings();
  const others = s.disabledHosts.filter((h) => h !== host);
  await chrome.storage.local.set({ [KEY.settings]: { ...s, disabledHosts: enabled ? others : [...others, host] } });
}

/** Everything we've learned about one manuscript, built up as pages are seen. */
export interface SeenManuscript {
  baseId: string;
  latestId: string;
  site: string | null;
  title?: string;
  status?: string;
  queue?: string;
  reviewers?: number;
  firstSeen: string;
  lastSeen: string;
  seenOn: string[];
}

export const KEY = {
  settings: 'settings',
  log: 'log',
  seen: 'seen',
  notes: 'notes',
  tab: (id: number) => `tab:${id}`,
} as const;

export async function getSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(KEY.settings);
  return { ...DEFAULT_SETTINGS, ...(got[KEY.settings] as Partial<Settings> | undefined) };
}
