// Messages between the content script, background and side panel, and the
// storage keys they share.

import type { ParseResult } from '../parsers/types';
import type { Level } from './log';

export type Msg =
  | { type: 'parsed'; result: ParseResult; reason: string; title: string | null }
  | { type: 'log'; level: Level; event: string; data?: unknown }
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
}

export const DEFAULT_SETTINGS: Settings = { overlay: true, rewriteTitle: true, verbose: false };

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
