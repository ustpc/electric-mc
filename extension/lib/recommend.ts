// Recommendations sent to the EIC. A co-chair's recommendation (Accept,
// Reject & Resubmit, …) is listed in the "Recommendations" box on the
// manuscript's details page, with "view recommendation" and, for the
// person who made it, "rescind". MC keeps such a manuscript in Awaiting AE
// Assignment, so we read the box, remember the person's own
// recommendations in a "To EIC" list, and note them on the queue grids
// until the EIC acts or the recommendation is rescinded. An immediate
// decision made without an AE doesn't show in that box, and MC goes on
// listing the manuscript under Assign AE, so we also note the choice when
// the person presses Submit or Commit Decision. Each gets the choice and the
// role it was made in, in blue under the ID; only a decision made as
// co-chair with no AE assigned also gets a light red row. Only the choice is kept, never the
// comments, and it stays in this browser.

import { pickedLabel, recommendsRole } from './recommendform';
import { labelKey, textOf, cellLines, truncate, isLayoutRow } from './text';
import { parseManuscriptId } from './ids';

export interface Recommendation {
  by: string;
  recommendation: string;
  /** "rescind" is offered only to the person who made it. */
  canRescind: boolean;
}

/** One manuscript in the To EIC list. */
export interface EicItem {
  id: string;
  baseId: string;
  site: string | null;
  title?: string;
  recommendation: string;
  /** When we first saw it (yyyy-mm-dd); MC doesn't show when it was made. */
  seen: string;
  /** A decision (Make Immediate Decision, Commit Decision) or a recommendation. */
  kind?: 'decision' | 'recommendation';
  /**
   * Where we learned it: the Recommendations box, or the person's own
   * Submit press. One from a press leaves only when a decision letter has
   * gone out, since the box may never show it.
   */
  source?: 'box' | 'submit';
  /** The role it was made in: the co-chair's own form, or the AE's. */
  role?: 'cc' | 'ae';
  /** No AE was assigned when it was made. */
  noAe?: boolean;
}

/** The label of the choice picked on the page (its radio button's row), or null. */
export function pickedChoice(doc: Document): string | null {
  const label = pickedLabel(doc);
  return label ? truncate(label, 60) : null;
}

/**
 * Whether a press of `control` sends a decision rather than a
 * recommendation: Commit Decision, the Make Immediate Decision task, or an
 * "… Immediate Decision" heading on the page.
 */
export function isDecisionPress(control: Element, task: string | null): boolean {
  const doc = control.ownerDocument;
  // An "… Recommends" form other than the co-chair's (the AE's) is never a decision.
  if (recommendsRole(doc) === 'other') return false;
  const label = labelKey(textOf(control) || control.getAttribute('value') || '');
  if (/decision$/.test(label)) return true;
  if (task && /decision/.test(task)) return true;
  // The form's own heading; not the "Make Immediate Decision" task link that
  // the details page lists next to every other task.
  return Array.from(doc.querySelectorAll('th, td, div, span, b, h2, h3, h4')).some(
    (e) => !e.closest('a') && !e.querySelector('a') && e.children.length <= 2 && textOf(e).length < 60 && /immediate decision$/.test(labelKey(textOf(e))),
  );
}

const NAME = /^[^,]{2,60}, [^,]{1,60}$/;
const DECISION = /\b(accept|minor revision|major revision|reject|resubmit|revis)/i;
const LINKS = /^(view recommendation|rescind)$/i;

/** The Recommendations box, if the page has one. */
export function recommendationsBox(doc: Document): Element | null {
  const head = Array.from(doc.querySelectorAll('div,th,td,h2,h3,h4,span,b')).find((e) => labelKey(textOf(e)) === 'recommendations' && e.children.length === 0);
  if (!head) return null;
  // The box is the nearest ancestor that holds more than the heading.
  let box: Element | null = head.parentElement;
  while (box && textOf(box) === textOf(head)) box = box.parentElement;
  return box;
}

/** Every recommendation in the box, in order. */
export function readRecommendations(box: Element): Recommendation[] {
  const names = new Set(Array.from(box.querySelectorAll('a')).map((a) => textOf(a)).filter((t) => NAME.test(t)));
  const out: Recommendation[] = [];
  let cur: Recommendation | null = null;
  for (const raw of cellLines(box)) {
    const line = raw.replace(/^[•·*\s]+/, '').trim();
    if (names.has(line)) {
      cur = { by: line, recommendation: '', canRescind: false };
      out.push(cur);
    } else if (cur && /^rescind$/i.test(line)) {
      cur.canRescind = true;
    } else if (cur && !cur.recommendation && !LINKS.test(line) && DECISION.test(line)) {
      cur.recommendation = line;
    }
  }
  return out.filter((r) => r.recommendation);
}

/**
 * The person's own recommendation on this page: one they can rescind, or one
 * made under the co-chair name in the editor block ("CC: …").
 */
export function myRecommendation(recs: Recommendation[], coChairName?: string): Recommendation | null {
  return recs.find((r) => r.canRescind) ?? recs.find((r) => !!coChairName && r.by === coChairName) ?? null;
}

const NOTE = 'eic-note';
const ROW_ATTR = 'data-emc-decided';
const STYLE_ID = 'emc-decided-style';
/** The blue of the note under the ID; the row itself is 10% red. */
export const DECIDED_COLOR = '#1d4ed8';
// More specific than the revision highlight, so a decided revision shows red.
const CSS = `table tr[${ROW_ATTR}] > td, table tr[${ROW_ATTR}] > th { background-color: rgba(220, 38, 38, 0.1) !important; }`;

/** The note for one manuscript. */
export function eicNote(item: EicItem): string {
  if (!item.recommendation) return 'E-MC: decision made; MC still lists it until the EIC acts';
  const as = item.role === 'ae' ? ' as AE' : item.role === 'cc' ? ' as co-chair' : '';
  return item.kind === 'decision'
    ? `E-MC: you decided ${item.recommendation}${as} (${item.seen}); MC still lists it until the EIC acts`
    : `E-MC: you recommended ${item.recommendation}${as} (seen ${item.seen}); waiting for the EIC`;
}

/** Whether a queue row's Status names an AE ("AE: Not Assigned" doesn't). */
export function rowHasAe(status: string): boolean {
  return status.split('\n').some((l) => /^\s*ae:\s*\S/i.test(l) && !/^\s*ae:\s*not assigned/i.test(l));
}

/**
 * Only a decision made as co-chair with no AE assigned gets the colored row
 * (it lingers in MC's Assign AE queue); a recommendation, or a decision made
 * as AE or with an AE on the paper, gets the note alone. An item from an
 * older build that doesn't say its role counts as a recommendation when the
 * row shows an AE.
 */
export function decidedAsCoChairWithoutAe(item: EicItem, status: string): boolean {
  if (item.kind !== 'decision' || item.role === 'ae') return false;
  if (item.noAe === false) return false;
  return !rowHasAe(status);
}

/**
 * Whether a queue row's Status says a decision was already made while the
 * Assign AE task is still open: after a co-chair's immediate decision MC
 * adds a "Make Decision (Due …)" task next to "Assign AE". "Make Immediate
 * Decision" is the co-chair's own option and doesn't count.
 */
export function decidedWithoutAe(status: string): boolean {
  const lines = status.split(/\n|(?=\bassign ae\b)|(?=\bmake (?:immediate )?decision\b)/i).map((l) => labelKey(l));
  return lines.some((l) => /^assign ae\b/.test(l)) && lines.some((l) => /^make decision\b/.test(l));
}

/**
 * Mark each manuscript in the To EIC list on a queue grid or search
 * results: a light red background on its rows (the ID row and the rows its
 * cells span) and a blue note under its ID, where MC puts "(Resubmitted)".
 */
export function annotateEicRows(doc: Document, items: Record<string, EicItem>, idPattern?: string): number {
  doc.querySelectorAll(`[data-electric-mc="${NOTE}"]`).forEach((e) => e.remove());
  doc.querySelectorAll(`[${ROW_ATTR}]`).forEach((e) => e.removeAttribute(ROW_ATTR));
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  let n = 0;
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.rows).filter((tr) => tr.closest('table') === table);
    const header = rows.find((tr) => Array.from(tr.cells).some((c) => labelKey(textOf(c)) === 'status'));
    if (!header) continue;
    const col = Array.from(header.cells).findIndex((c) => labelKey(textOf(c)) === 'status');
    let span = 0;
    for (const tr of rows) {
      const ref = parseManuscriptId(textOf(tr.cells[0] ?? null), idPattern);
      if (!ref) {
        // A continuation row of a marked manuscript.
        if (span > 0 && !isLayoutRow(tr)) {
          tr.setAttribute(ROW_ATTR, '');
          span--;
        }
        continue;
      }
      span = 0;
      const status = tr.cells[col] ? cellLines(tr.cells[col]!).join('\n') : '';
      const saved = items[ref.id];
      const item: EicItem | undefined =
        saved ?? (decidedWithoutAe(status) ? { id: ref.id, baseId: ref.baseId, site: null, recommendation: '', seen: '', kind: 'decision', role: 'cc', noAe: true } : undefined);
      const cell = item && col >= 0 ? (tr.cells[0] ?? null) : null;
      if (!item || !cell) continue;
      const colored = decidedAsCoChairWithoutAe(item, status) || (!saved || decidedWithoutAe(status));
      // An older item's "decision" on a row with an AE was the AE's recommendation.
      const shown: EicItem = item.kind === 'decision' && !item.role && rowHasAe(status) ? { ...item, kind: 'recommendation' } : item;
      if (colored) {
        tr.setAttribute(ROW_ATTR, item.id);
        span = Math.max(1, ...Array.from(tr.cells).map((c) => c.rowSpan || 1)) - 1;
      }
      const note = doc.createElement('div');
      note.setAttribute('data-electric-mc', NOTE);
      note.style.cssText = `margin-top:4px;color:${DECIDED_COLOR} !important;font-weight:700 !important`;
      note.textContent = eicNote(shown);
      cell.appendChild(note);
      n++;
    }
  }
  return n;
}

/** Plain-text summary of the To EIC list, oldest first, to paste into a message. */
export function eicSummary(items: EicItem[]): string {
  const lines = [...items]
    .sort((a, b) => a.seen.localeCompare(b.seen))
    .map((m) => `${m.id}${m.title ? ` "${m.title}"` : ''}: ${m.recommendation} (since ${m.seen})`);
  return [`Recommendations waiting for your decision (${items.length}):`, '', ...lines].join('\n');
}
