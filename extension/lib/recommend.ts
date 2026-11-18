// Recommendations sent to the EIC. A co-chair's recommendation (Accept,
// Reject & Resubmit, …) is listed in the "Recommendations" box on the
// manuscript's details page, with "view recommendation" and, for the
// person who made it, "rescind". MC keeps such a manuscript in Awaiting AE
// Assignment, so we read the box, remember the person's own
// recommendations in a "To EIC" list, and note them on the queue grids
// until the EIC acts or the recommendation is rescinded. An immediate
// decision made without an AE doesn't show in that box, and MC goes on
// listing the manuscript under Assign AE, so we also note the choice when
// the person presses Submit or Commit Decision. Those rows get a light red
// background and the choice in red. Only the choice is kept, never the
// comments, and it stays in this browser.

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
}

/** The label of the choice picked on the page (its radio button's row), or null. */
export function pickedChoice(doc: Document): string | null {
  const radio = doc.querySelector<HTMLInputElement>('input[type=radio]:checked');
  const row = radio?.closest('tr');
  if (!row) return null;
  const label = textOf(row).replace(/\s+/g, ' ').trim();
  return label ? truncate(label, 60) : null;
}

/**
 * Whether a press of `control` sends a decision rather than a
 * recommendation: Commit Decision, the Make Immediate Decision task, or an
 * "… Immediate Decision" heading on the page.
 */
export function isDecisionPress(control: Element, task: string | null): boolean {
  const label = labelKey(textOf(control) || control.getAttribute('value') || '');
  if (/decision$/.test(label)) return true;
  if (task && /decision/.test(task)) return true;
  return Array.from(control.ownerDocument.querySelectorAll('th, td, div, span, b, h2, h3, h4')).some(
    (e) => e.children.length <= 2 && textOf(e).length < 60 && /immediate decision$/.test(labelKey(textOf(e))),
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
/** The red of the note and, at 10%, of the row. */
export const DECIDED_COLOR = '#b91c1c';
// More specific than the revision highlight, so a decided revision shows red.
const CSS = `table tr[${ROW_ATTR}] > td, table tr[${ROW_ATTR}] > th { background-color: rgba(220, 38, 38, 0.1) !important; }`;

/** The note for one manuscript. */
export function eicNote(item: EicItem): string {
  return item.kind === 'decision'
    ? `E-MC: you decided ${item.recommendation} (${item.seen}); MC still lists it until the EIC acts`
    : `E-MC: you recommended ${item.recommendation} (seen ${item.seen}); waiting for the EIC`;
}

/**
 * Mark each manuscript in the To EIC list on a queue grid or search
 * results: a light red background on its rows (the ID row and the rows its
 * cells span) and a red note in its Status cell.
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
      const item = items[ref.id];
      const cell = item && (tr.cells[col] ?? null);
      if (!item || !cell) continue;
      tr.setAttribute(ROW_ATTR, item.id);
      span = Math.max(1, ...Array.from(tr.cells).map((c) => c.rowSpan || 1)) - 1;
      const note = doc.createElement('div');
      note.setAttribute('data-electric-mc', NOTE);
      note.style.cssText = `margin-top:4px;color:${DECIDED_COLOR} !important;font-weight:700 !important`;
      note.textContent = eicNote(item);
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
