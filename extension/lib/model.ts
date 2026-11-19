// The data model's merge rules, as pure functions: what the background does
// to stored data when a page is parsed or a content script learns
// something. No chrome.* and no DOM here, so every rule has a unit test
// (tests/model.test.ts); the background only reads, applies and writes,
// inside its storage queue.

import type { EicItem } from './recommend';
import type { SeenManuscript } from './messages';
import type { VersionInfo } from './milestones';
import type { ParseResult } from '../parsers/types';

export type SeenStore = Record<string, SeenManuscript>;
export type SeenUpdate = Partial<SeenManuscript> & { baseId: string; latestId: string };

/** "Not assigned" is MC's placeholder, not an AE. */
const realAe = (s: string | undefined) => (s && !/not assigned/i.test(s) ? s : undefined);

export function revisionOf(id: string): number {
  const m = /\.R(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/** What a parse says about manuscripts: the one on a details page, and each row of a real queue list. */
export function seenUpdates(r: ParseResult): SeenUpdate[] {
  const out: SeenUpdate[] = [];
  if (r.manuscript) {
    const m = r.manuscript;
    const ae = realAe(m.handlingEditor);
    out.push({ baseId: m.baseId, latestId: m.id, title: m.title, status: m.status, reviewers: m.reviewers.length, aeByVersion: ae ? { [m.id]: ae } : undefined });
  }
  // Only real queue lists: a manuscript page's Notes table also lists IDs.
  for (const row of r.pageType === 'queue-list' ? r.rows ?? [] : []) {
    out.push({ baseId: row.baseId, latestId: row.id, title: row.title, status: row.status, queue: r.heading ?? undefined });
  }
  return out;
}

/** Seen with the updates merged in: fields seen win over blanks, the highest revision is kept, and every version's AE. */
export function mergeSeen(seen: SeenStore, updates: SeenUpdate[], site: string | null, pageType: string, now: string): SeenStore {
  const out = { ...seen };
  for (const u of updates) {
    const prev = out[u.baseId];
    const merged: SeenManuscript = { ...(prev ?? { baseId: u.baseId, latestId: u.latestId, site, firstSeen: now, lastSeen: now, seenOn: [] }) };
    const { aeByVersion, latestId, ...rest } = u;
    for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== '') (merged as unknown as Record<string, unknown>)[k] = v;
    if (!prev || revisionOf(latestId) >= revisionOf(prev.latestId)) merged.latestId = latestId;
    if (aeByVersion) merged.aeByVersion = { ...prev?.aeByVersion, ...aeByVersion };
    merged.lastSeen = now;
    if (!merged.seenOn.includes(pageType)) merged.seenOn = [...merged.seenOn, pageType];
    out[u.baseId] = merged;
  }
  return out;
}

function defined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Seen with one version's AE, status or details merged in; null when there is nothing to add. */
export function mergeVersion(seen: SeenStore, baseId: string, id: string, now: string, ae?: string, status?: string, info?: VersionInfo): SeenStore | null {
  ae = realAe(ae);
  if (info?.ae && !realAe(info.ae)) info = { ...info, ae: undefined };
  if (!ae && !status && !info) return null;
  const prev = seen[baseId] ?? { baseId, latestId: id, site: null, firstSeen: now, lastSeen: now, seenOn: [] };
  return {
    ...seen,
    [baseId]: {
      ...prev,
      aeByVersion: ae ? { ...prev.aeByVersion, [id]: ae } : prev.aeByVersion,
      statusByVersion: status ? { ...prev.statusByVersion, [id]: status } : prev.statusByVersion,
      // Merge, so a later partial update (just the decision date) keeps what we knew.
      versionInfo: info ? { ...prev.versionInfo, [id]: { ...prev.versionInfo?.[id], ...defined(info) } } : prev.versionInfo,
    },
  };
}

/** Flag labels with a journal's new ones merged in; null when nothing changed. */
export function mergeFlags(all: Record<string, Record<string, string>>, journal: string, map: Record<string, string>): Record<string, Record<string, string>> | null {
  const merged = { ...(all[journal] ?? {}), ...map };
  return JSON.stringify(merged) === JSON.stringify(all[journal] ?? {}) ? null : { ...all, [journal]: merged };
}

/** The To EIC list with one item added or changed, or one removed; null when nothing changed. The first date seen is kept. */
export function applyEic(all: Record<string, EicItem>, set?: EicItem, remove?: string): Record<string, EicItem> | null {
  const out = { ...all };
  let changed = false;
  if (set) {
    const prev = out[set.id];
    if (!(prev && prev.recommendation === set.recommendation && prev.title === set.title && prev.kind === set.kind && prev.source === set.source)) {
      out[set.id] = { ...set, seen: prev?.seen ?? set.seen };
      changed = true;
    }
  }
  if (remove && out[remove]) {
    delete out[remove];
    changed = true;
  }
  return changed ? out : null;
}
