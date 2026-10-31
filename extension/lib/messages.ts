// Messages between the content script, background and side panel, and the
// storage keys they share.

import type { ParseResult } from '../parsers/types';
import type { Level } from './log';
import type { AeLoadEntry } from './aeload';
import type { VersionInfo } from './milestones';
import type { EicItem } from './recommend';
import type { Role } from './roles';
import type { McIdentity } from './identity';

export type Msg =
  | { type: 'parsed'; result: ParseResult; reason: string; title: string | null }
  | { type: 'log'; level: Level; event: string; data?: unknown }
  | { type: 'disabled' }
  | { type: 'version-info'; baseId: string; id: string; ae?: string; status?: string; info?: VersionInfo; source: 'backend' | 'page' }
  | { type: 'ae-load'; journal: string; entries: AeLoadEntry[] }
  | { type: 'roles'; site: string; roles: Role[] }
  | { type: 'eic'; set?: EicItem; remove?: string }
  | { type: 'identity'; site: string; identity: McIdentity }
  // Side panel → content script (via tabs.sendMessage)
  | { type: 'reparse' }
  | { type: 'capture' }
  | { type: 'ping' }
  | { type: 'open'; id: string }
  | { type: 'abstract' };

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
  /**
   * Press "Log In" once a password manager has filled the login form. Off by
   * default for now. (Builds before 0.0.15 called it autoSubmitLogin, on by
   * default; that value is dropped so everyone starts with it off.)
   */
  autoLogin: boolean;
  /** Show revisions (.R1, .R2, …) bold on a yellow background in queue lists. */
  highlightRevisions: boolean;
  /** On a revision, show earlier versions' AEs and dates, from versions already opened (no background lookup). */
  lookupEarlierVersions: boolean;
  /** Widen MC's fixed-width column to the window, less half an inch each side. */
  fullWidth: boolean;
  /** MC body text size in px (MC's own is 11); 0 leaves it alone. */
  fontSize: number;
  /** After any search that finds exactly one manuscript, press its Take Action. */
  autoTakeAction: boolean;
  /** Hide MC's page-title image ("Search Results") and the empty column under it. */
  hidePageHeader: boolean;
  /** Press a file input's Attach control as soon as a file is chosen. */
  autoAttach: boolean;
  /** The person's name on their notes; shown with MC's name in parentheses when the two differ. */
  displayName: string;
  /** The notes server (backend/notes function URL). Empty: notes stay in this browser. */
  notesServer: string;
}

export const DEFAULT_SETTINGS: Settings = {
  developer: false,
  rewriteTitle: true,
  disabledHosts: [],
  autoLogin: false,
  highlightRevisions: true,
  lookupEarlierVersions: true,
  fullWidth: false,
  fontSize: 0,
  autoTakeAction: false,
  hidePageHeader: false,
  autoAttach: true,
  displayName: '',
  notesServer: '',
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

/**
 * Whether the side panel shows on this tab: on Manuscript Central only, even
 * where the extension is switched off, since the switch is in the panel.
 */
export function panelEnabledFor(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)manuscriptcentral\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export const PANEL_PATH = 'sidepanel.html';

/**
 * The side panel options to set for one tab, or null to leave the tab on the
 * window-wide panel (so it follows the person across MC tabs). Non-MC tabs
 * are switched off. An MC tab we switched off before gets its own panel back
 * with the path: Chrome can't drop a tab's override, and an override that is
 * enabled but has no path leaves nothing to open (0.0.27).
 */
export function panelOptionsFor(url: string | undefined, wasDisabled: boolean): { enabled: boolean; path?: string } | null {
  if (!panelEnabledFor(url)) return { enabled: false };
  return wasDisabled ? { enabled: true, path: PANEL_PATH } : null;
}

export async function setHostEnabled(host: string, enabled: boolean): Promise<void> {
  const s = await getSettings();
  const others = s.disabledHosts.filter((h) => h !== host);
  await saveSettings({ ...s, disabledHosts: enabled ? others : [...others, host] });
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
  lastPrune: 'lastPrune',
  /** AE workloads read from MC's assignment pull-down, by journal (lib/aeload.ts). */
  aeLoad: 'aeLoad',
  /** The Opinions roster the person loaded for the matrix (lib/roster.ts). */
  roster: 'roster',
  /** MC roles seen, per site (lib/roles.ts). */
  roles: 'roles',
  /** Recommendations the person sent to the EIC, by manuscript ID (lib/recommend.ts). */
  eic: 'eic',
  /** AE expertise profiles the person loaded, as the file was written (lib/match.ts). */
  aeProfiles: 'aeProfiles',
  /** Who is logged in to MC, per site (lib/identity.ts). */
  identity: 'identity',
  tab: (id: number) => `tab:${id}`,
} as const;

/**
 * Settings live in chrome.storage.sync, so they follow the person's Chrome
 * profile to every computer they sign in to, with no Electric MC account.
 * Builds before 0.2.6 kept them in storage.local; those are copied over once.
 */
export const SETTINGS_AREA = 'sync' as const;

export async function getSettings(): Promise<Settings> {
  let got = (await chrome.storage.sync.get(KEY.settings))[KEY.settings] as Record<string, unknown> | undefined;
  if (!got) {
    got = (await chrome.storage.local.get(KEY.settings))[KEY.settings] as Record<string, unknown> | undefined;
    if (got) {
      await chrome.storage.sync.set({ [KEY.settings]: got }).catch(() => {});
      await chrome.storage.local.remove(KEY.settings);
    }
  }
  // Older builds stored `overlay` and `verbose`; they are ignored now.
  const { overlay: _o, verbose: _v, autoSubmitLogin: _a, ...saved } = (got ?? {}) as Partial<Settings> & {
    overlay?: unknown;
    verbose?: unknown;
    autoSubmitLogin?: unknown;
  };
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(s: Settings): Promise<void> {
  return chrome.storage.sync.set({ [KEY.settings]: s });
}
