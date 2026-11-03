// Joining MC's AE workloads to the Opinions roster for the editorial matrix.

import { matchPerson, type AeLoad, type AeLoadEntry } from './aeload';
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
