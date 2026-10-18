// Messages between the content script, background and side panel, and the
// storage keys they share.

import type { ParseResult } from '../parsers/types';
import type { Level } from './log';
import type { VersionInfo } from './milestones';

export type Msg =
  | { type: 'parsed'; result: ParseResult; reason: string; title: string | null }
  | { type: 'log'; level: Level; event: string; data?: unknown }
  | { type: 'disabled' }
  | { type: 'version-info'; baseId: string; id: string; ae?: string; status?: string; info?: VersionInfo; source: 'backend' | 'page' }
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
  /**
   * Developer mode: the on-page debug badge, the toolbar page-type badge,
   * full parse results in the log, the Log tab, capture and raw JSON. Off for
   * everyone else, who get a quiet extension and a log of problems only.
   */
  developer: boolean;
  rewriteTitle: boolean;
  idPattern?: string;
  /** Hostnames where the extension does nothing. */
  disabledHosts: string[];
  /** Press "Log In" once a password manager has filled the login form. */
  autoSubmitLogin: boolean;
  /** Show revisions (.R1, .R2, …) bold on a yellow background in queue lists. */
  highlightRevisions: boolean;
  /** On a revision, look up the AE of every earlier version in the background. */
  lookupEarlierVersions: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  developer: false,
  rewriteTitle: true,
  disabledHosts: [],
  autoSubmitLogin: true,
  highlightRevisions: true,
  lookupEarlierVersions: true,
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
  /** Handling AE for each version seen, keyed by the full ID ("…-1111.R1"). */
  aeByVersion?: Record<string, string>;
  /** Status or decision of each version, when known. */
  statusByVersion?: Record<string, string>;
  /** Dates and editors of each earlier version, read from its details page. */
  versionInfo?: Record<string, VersionInfo>;
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
  // Older builds stored `overlay` and `verbose`; they are ignored now.
  const { overlay: _o, verbose: _v, ...saved } = (got[KEY.settings] ?? {}) as Partial<Settings> & { overlay?: unknown; verbose?: unknown };
  return { ...DEFAULT_SETTINGS, ...saved };
}
