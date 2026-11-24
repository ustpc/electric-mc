// Joining MC's AE workloads to the Opinions roster for the editorial matrix.

import { matchPerson, type AeLoad, type AeLoadEntry } from './aeload';
import type { SeenManuscript } from './messages';
import { revisionOf } from './model';
import type { RosterPerson } from './roster';

export interface Joined {
  /** Current assignment count by roster id. */
  counts: Map<string, number>;
  /** Editors in MC's pull-down that match nobody in the roster. */
  unmatched: AeLoadEntry[];
}

export function joinLoads(people: RosterPerson[], entries: AeLoadEntry[]): Joined {
  const counts = new Map<string, number>();
  const unmatched: AeLoadEntry[] = [];
  for (const e of entries) {
    const p = matchPerson(e.name, people);
    // Two MC entries for one person (two accounts) add up.
    if (p) counts.set(p.id, (counts.get(p.id) ?? 0) + e.count);
    else unmatched.push(e);
  }
  return { counts, unmatched };
}

/** The journal to show first: the most recently read one. */
export function latestJournal(loads: Record<string, AeLoad>): string | undefined {
  return Object.values(loads).sort((a, b) => b.at.localeCompare(a.at))[0]?.journal;
}

export function assignedLabel(n: number): string {
  return `${n} assigned`;
}

/** One manuscript assigned to an editor, as E-MC has seen it in MC. */
export interface Assignment {
  id: string;
  title: string;
}

/** MC statuses that mean the manuscript is finished: no longer an assignment. */
const FINISHED = /\b(?:reject(?:ed)?|accept(?:ed)?|withdrawn?|archived|transferred|decision (?:made|sent)|immediate decision)\b/i;

/** The handling AE of a manuscript's newest version that has one. */
function currentAe(m: SeenManuscript): string | undefined {
  const by = m.aeByVersion ?? {};
  if (by[m.latestId]) return by[m.latestId];
  return Object.keys(by).sort((a, b) => revisionOf(b) - revisionOf(a)).map((k) => by[k]).find(Boolean);
}

/**
 * Each person's current assignments, from the manuscripts E-MC has seen in
 * MC (KEY.seen): a manuscript belongs to the AE of its newest version, unless
 * its status says it's finished. Only manuscripts whose details page was
 * opened carry an AE, so this can be fewer than MC's count. Kept in this
 * browser; nothing here leaves it.
 */
export function assignmentsByPerson<P extends { id: string; name: string }>(people: P[], seen: Record<string, SeenManuscript>): Map<string, Assignment[]> {
  const out = new Map<string, Assignment[]>();
  for (const m of Object.values(seen)) {
    if (m.status && FINISHED.test(m.status)) continue;
    const ae = currentAe(m);
    const p = ae ? matchPerson(ae, people) : undefined;
    if (!p) continue;
    const list = out.get(p.id) ?? [];
    list.push({ id: m.latestId, title: m.title ?? '' });
    out.set(p.id, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
