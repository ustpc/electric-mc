// The Seen list and notes in the side panel: filtering the list, setting one
// manuscript's note, and pruning manuscripts not viewed for two years (with
// their notes) so local data doesn't pile up.

import type { SeenManuscript } from './messages';

/** Manuscripts whose ID or title contains the query anywhere, ignoring case. */
export function filterSeen(list: SeenManuscript[], query: string): SeenManuscript[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((m) => [m.latestId, m.baseId, m.title ?? ''].some((s) => s.toLowerCase().includes(q)));
}

/** Two years: articles can take six to nine months, often longer. */
export const MAX_AGE_DAYS = 730;
const DAY_MS = 86_400_000;

/**
 * Seen entries and notes with every manuscript not viewed in maxAgeDays
 * removed. A dropped manuscript's notes (keyed by its base ID or any version
 * ID) go with it; notes that match no Seen entry at all are kept.
 */
export function pruneSeen(
  seen: Record<string, SeenManuscript>,
  notes: Record<string, string>,
  now: Date,
  maxAgeDays = MAX_AGE_DAYS,
): { seen: Record<string, SeenManuscript>; notes: Record<string, string>; dropped: number } {
  const cutoff = now.getTime() - maxAgeDays * DAY_MS;
  const kept: Record<string, SeenManuscript> = {};
  const gone: string[] = [];
  for (const [k, m] of Object.entries(seen)) {
    const t = Date.parse(m.lastSeen);
    if (Number.isFinite(t) && t < cutoff) gone.push(m.baseId);
    else kept[k] = m;
  }
  const belongs = (key: string, baseId: string) => key === baseId || key.startsWith(`${baseId}.R`);
  const keptNotes = Object.fromEntries(Object.entries(notes).filter(([key]) => !gone.some((b) => belongs(key, b))));
  return { seen: kept, notes: keptNotes, dropped: gone.length };
}

/** Notes with one manuscript's note set; an empty note is removed. */
export function withNote(notes: Record<string, string>, id: string, text: string): Record<string, string> {
  const { [id]: _old, ...rest } = notes;
  return text.trim() ? { ...rest, [id]: text } : rest;
}
