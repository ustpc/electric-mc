// Probes: named checks that the parts of MC's pages our features depend on
// are where we expect them. A probe answers found or not found, never with
// page text, so its results can be kept and logged. They are learned per MC
// page name (CURRENT_PAGE): a probe that has passed often on a page and
// then fails on several loads in a row means MC changed that page. The
// side panel says so, and the automations that need it refuse to run
// (one-button reject today). The learning rule is pure (applyProbes) and
// lives here with its thresholds.

import { findNavBar, taskLinks } from './advance';
import { findAeSelect } from './aeload';
import { findSearchToggle } from './keepalive';
import { readIdentity } from './identity';
import { findSearchForm } from './search';
import { takeActionGrids } from './grid';
import { recommendsRole } from './recommendform';
import { rolesIn } from '../parsers/dom';

export const PROBES = {
  /** "AE: …", "CC: …" lines on a manuscript page. */
  editorBlock: (doc: Document) => rolesIn(doc.body).size > 0,
  /** Task links ("Make Recommendation (Due …)"). */
  taskLinks: (doc: Document) => taskLinks(doc).size > 0,
  /** The previous/next manuscript arrows. */
  navBar: (doc: Document) => !!findNavBar(doc),
  /** The Assign Associate Editor pull-down. */
  aeSelect: (doc: Document) => !!findAeSelect(doc),
  /** A "… Recommends" form. */
  recommendsForm: (doc: Document) => recommendsRole(doc) !== null,
  /** A Take Action grid with at least one manuscript row. */
  takeActionGrid: (doc: Document) => takeActionGrids(doc).some((g) => g.rows.length > 0),
  /** MC's search bar. */
  searchForm: (doc: Document) => !!findSearchForm(doc),
  /** The "+ Search" toggle the keepalive presses. */
  searchToggle: (doc: Document) => !!findSearchToggle(doc),
  /** Who is logged in, from MC's analytics metadata. */
  identity: (doc: Document) => !!readIdentity(doc),
} satisfies Record<string, (doc: Document) => boolean>;

export type ProbeName = keyof typeof PROBES;
export type ProbeResults = Partial<Record<ProbeName, boolean>>;

/** Which probes each automation needs, to refuse to run when one is broken. */
export const NEEDS: Record<string, ProbeName[]> = {
  oneButtonReject: ['aeSelect', 'editorBlock', 'identity', 'searchForm'],
};

/** Run every probe on the page; a probe that throws counts as not found. */
export function runProbes(doc: Document): ProbeResults {
  const out: ProbeResults = {};
  for (const [name, probe] of Object.entries(PROBES) as Array<[ProbeName, (d: Document) => boolean]>) {
    try {
      out[name] = probe(doc);
    } catch {
      out[name] = false;
    }
  }
  return out;
}

/** What we know about one probe on one MC page. */
export interface ProbeStat {
  pass: number;
  fail: number;
  /** Failures in a row, since the last pass. */
  failStreak: number;
}
export type ProbeStore = Record<string, Partial<Record<ProbeName, ProbeStat>>>;

/** Passes before a probe counts as part of the page. */
export const ESTABLISHED = 20;
/** Failures in a row after that, before we say MC changed. */
export const BROKEN_AFTER = 3;

export function isBroken(s: ProbeStat | undefined): boolean {
  return !!s && s.pass >= ESTABLISHED && s.failStreak >= BROKEN_AFTER;
}

/** The store with one page load's results counted, and which probes just broke or recovered. */
export function applyProbes(store: ProbeStore, page: string, results: ProbeResults): { store: ProbeStore; broke: ProbeName[]; recovered: ProbeName[] } {
  const before = store[page] ?? {};
  const after: Partial<Record<ProbeName, ProbeStat>> = { ...before };
  const broke: ProbeName[] = [];
  const recovered: ProbeName[] = [];
  for (const [name, ok] of Object.entries(results) as Array<[ProbeName, boolean]>) {
    const prev = before[name] ?? { pass: 0, fail: 0, failStreak: 0 };
    const next: ProbeStat = ok ? { pass: prev.pass + 1, fail: prev.fail, failStreak: 0 } : { pass: prev.pass, fail: prev.fail + 1, failStreak: prev.failStreak + 1 };
    if (!isBroken(prev) && isBroken(next)) broke.push(name);
    if (isBroken(prev) && !isBroken(next)) recovered.push(name);
    after[name] = next;
  }
  return { store: { ...store, [page]: after }, broke, recovered };
}

/** Every broken probe, by page: what the side panel lists. */
export function brokenProbes(store: ProbeStore): Array<{ page: string; probe: ProbeName }> {
  const out: Array<{ page: string; probe: ProbeName }> = [];
  for (const [page, stats] of Object.entries(store)) for (const [probe, s] of Object.entries(stats) as Array<[ProbeName, ProbeStat]>) if (isBroken(s)) out.push({ page, probe });
  return out;
}

/** The probes an automation needs that are broken on this page, if any. */
export function blockedBy(store: ProbeStore | undefined, page: string | null, automation: keyof typeof NEEDS): ProbeName[] {
  if (!store || !page) return [];
  return (NEEDS[automation] ?? []).filter((p) => isBroken(store[page]?.[p]));
}
