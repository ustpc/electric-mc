// Recommendations sent to the EIC. A co-chair's recommendation (Accept,
// Reject & Resubmit, …) is listed in the "Recommendations" box on the
// manuscript's details page, with "view recommendation" and, for the
// person who made it, "rescind". MC keeps such a manuscript in Awaiting AE
// Assignment, so we read the box, remember the person's own
// recommendations in a "To EIC" list, and note them on the queue grids
// until the EIC acts or the recommendation is rescinded. Only the
// recommendation itself is kept, never the comments.

import { labelKey, textOf, cellLines } from './text';
import { EMC_STYLE } from './milestones';
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

/** Note each manuscript in the To EIC list on a queue grid, in its Status cell. */
export function annotateEicRows(doc: Document, items: Record<string, EicItem>, idPattern?: string): number {
  doc.querySelectorAll(`[data-electric-mc="${NOTE}"]`).forEach((e) => e.remove());
  let n = 0;
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.rows).filter((tr) => tr.closest('table') === table);
    const header = rows.find((tr) => Array.from(tr.cells).some((c) => labelKey(textOf(c)) === 'status'));
    if (!header) continue;
    const col = Array.from(header.cells).findIndex((c) => labelKey(textOf(c)) === 'status');
    for (const tr of rows) {
      const ref = parseManuscriptId(textOf(tr.cells[0] ?? null), idPattern);
      const item = ref && items[ref.id];
      const cell = item && (tr.cells[col] ?? null);
      if (!item || !cell) continue;
      const note = doc.createElement('div');
      note.setAttribute('data-electric-mc', NOTE);
      note.style.cssText = `margin-top:4px;${EMC_STYLE}`;
      note.textContent = `E-MC: you recommended ${item.recommendation} (seen ${item.seen}); waiting for the EIC`;
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
