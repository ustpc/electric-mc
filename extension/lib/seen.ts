// Filtering the Seen list in the side panel.

import type { SeenManuscript } from './messages';

/** Manuscripts whose ID or title contains the query anywhere, ignoring case. */
export function filterSeen(list: SeenManuscript[], query: string): SeenManuscript[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((m) => [m.latestId, m.baseId, m.title ?? ''].some((s) => s.toLowerCase().includes(q)));
}
