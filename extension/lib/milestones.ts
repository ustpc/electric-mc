// Rows Electric MC adds to the "Peer Review Milestones" table on a revision:
// when the previous version was submitted and answered, and who handled it.
// Everything we add to MC's pages is bold in the E-MC color so it can't be
// mistaken for ScholarOne's own content.

import { labeledValues } from '../parsers/dom';
import { parseManuscriptId } from './ids';
import { labelKey, textOf, isLayoutRow } from './text';

/** The E-MC color: the brown of the side panel's warning pill. */
export const EMC_COLOR = '#b45309';
export const EMC_STYLE = `color:${EMC_COLOR} !important;font-weight:700 !important`;

/** What we know about one earlier version. */
export interface VersionInfo {
  id: string;
  submitted?: string;
  /** When the decision on that version was sent to the author. */
  responded?: string;
  ae?: string;
  coChair?: string;
}

const DATE = /\b\d{1,2}-[A-Z][a-z]{2}-\d{4}\b/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// Role links MC prints after a name ("Co-Chair, Opinions AU REV AE CC").
const ROLE_TAIL = /(\s+(AU|REV|AE|CC|EIC|ADM|PROD|SE|ME|EO))+$/;

const SUBMITTED = [/^date submitted$/, /^submitted$/, /^submission date$/];
const RESPONDED = [
  /^(date )?decision letter sent$/,
  /^(date )?decision sent$/,
  /^date (to|sent to) author$/,
  /^(date )?response sent$/,
  /^decision date$/,
  /^date of decision$/,
];
const AE = [/^associate editor$/, /^ae$/, /^handling editor$/];
const CO_CHAIR = [/^co-chair$/, /^cc$/];

/** Read an earlier version's dates and editors from its details page. */
export function versionInfoFrom(doc: Document, id: string): VersionInfo {
  const fields = labeledValues(doc.body);
  const find = (res: RegExp[], date = false) => {
    for (const re of res)
      for (const [k, v] of fields) {
        if (!re.test(k) || (date && /\bdue\b/.test(k))) continue;
        if (!date) {
          const name = person(v);
          if (name) return name;
        } else {
          const d = DATE.exec(v)?.[0];
          if (d) return d;
        }
      }
    return undefined;
  };
  return { id, submitted: find(SUBMITTED, true), responded: find(RESPONDED, true), ae: find(AE), coChair: find(CO_CHAIR) };
}

/** Labels on a page, without values, for the developer log when a field is missing. */
export function labelsOn(doc: Document): string[] {
  return [...labeledValues(doc.body).keys()].slice(0, 80);
}

function person(v: string): string | undefined {
  const s = v.replace(ROLE_TAIL, '').trim();
  return s && !/not assigned/i.test(s) ? s : undefined;
}

export function parseMcDate(s: string | undefined): Date | null {
  const m = s && /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]!.toLowerCase());
  return mon < 0 ? null : new Date(Date.UTC(Number(m[3]), mon, Number(m[1])));
}

export function daysBetween(a: string | undefined, b: string | undefined): number | null {
  const x = parseMcDate(a);
  const y = parseMcDate(b);
  return x && y ? Math.round((y.getTime() - x.getTime()) / 86_400_000) : null;
}

/** "R1", or "Original" for the first submission. */
export function versionName(id: string): string {
  const m = /\.R(\d+)$/.exec(id);
  return m ? `R${m[1]}` : 'Original';
}

/** The row in the Peer Review Milestones table labeled "Date Submitted". */
export function findMilestonesRow(doc: Document): HTMLTableRowElement | null {
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.rows).filter((tr) => !isLayoutRow(tr));
    const row = rows.find((tr) => {
      const first = tr.cells[0];
      return !!first && labelKey(textOf(first)) === 'date submitted' && tr.cells.length >= 2;
    });
    if (!row) continue;
    // Make sure it's the milestones section, not another table with the same label.
    let el: Element | null = table;
    for (let i = 0; el && i < 6; i++, el = el.parentElement) {
      if (/peer review milestones/i.test(textOf(el).slice(0, 2000))) return row;
    }
  }
  return null;
}

/**
 * Add (or refresh) our two rows at the bottom of the milestones table. Rows copy the look
 * of MC's own four-cell rows when the table has one. Returns whether the
 * rows are on the page.
 */
export function addMilestoneRows(doc: Document, v: VersionInfo): boolean {
  const anchor = findMilestonesRow(doc);
  if (!anchor) return false;
  const table = anchor.closest('table')!;
  table.querySelectorAll('tr[data-electric-mc="milestones"]').forEach((tr) => tr.remove());

  const name = versionName(v.id);
  const days = daysBetween(v.submitted, v.responded);
  const responded = v.responded ? `${v.responded}${days !== null ? ` (${days} days)` : ''}` : 'not found';
  const pairs: Array<[[string, string], [string, string]]> = [
    [
      [`Date ${name} submitted:`, v.submitted ?? 'not found'],
      [`Date ${name} response sent:`, responded],
    ],
    [
      [`${name} Associate Editor:`, v.ae ?? 'not found'],
      [`${name} Co-Chair:`, v.coChair ?? 'not found'],
    ],
  ];

  const template = Array.from(table.rows).find((tr) => tr.cells.length === 4 && !tr.hasAttribute('data-electric-mc'));
  // At the bottom of the table, after MC's own rows (Simson's choice).
  const own = Array.from(table.rows).filter((tr) => tr.closest('table') === table && !tr.hasAttribute('data-electric-mc'));
  let after: HTMLTableRowElement = own[own.length - 1] ?? anchor;
  for (const [left, right] of pairs) {
    const tr = (template ?? anchor).cloneNode(false) as HTMLTableRowElement;
    tr.setAttribute('data-electric-mc', 'milestones');
    const cells = template
      ? [left[0], left[1], right[0], right[1]]
      : [left[0], `${left[1]}  |  ${right[0]} ${right[1]}`];
    const shapes = Array.from((template ?? anchor).cells);
    cells.forEach((text, i) => {
      const cell = shapes[i]!.cloneNode(false) as HTMLTableCellElement;
      cell.removeAttribute('id');
      cell.textContent = text;
      cell.style.cssText += `;${EMC_STYLE}`;
      tr.appendChild(cell);
    });
    after.after(tr);
    after = tr;
  }
  return true;
}

/**
 * Decision letters in an Audit Trail table, keyed by the manuscript ID in
 * the letter's subject ("Decision on Manuscript ID CACM-26-03-1111.R1").
 * The date is when MC sent it. Only letters MC reports as sent count.
 */
export function decisionLettersIn(root: ParentNode, idPattern?: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const rows = Array.from(table.rows).filter((tr) => !isLayoutRow(tr));
    const header = rows.find((tr) => {
      const h = Array.from(tr.cells).map((c) => labelKey(textOf(c)));
      return h.some((x) => /^date/.test(x)) && h.includes('event');
    });
    if (!header) continue;
    const dateCol = Array.from(header.cells).findIndex((c) => /^date/.test(labelKey(textOf(c))));
    const eventCol = Array.from(header.cells).findIndex((c) => labelKey(textOf(c)) === 'event');
    // Header cells and data cells can be offset by a grouping column (the R1 bar).
    const shift = (tr: HTMLTableRowElement) => Math.max(0, tr.cells.length - header.cells.length);
    for (const tr of rows) {
      if (tr === header) continue;
      const s = shift(tr);
      const event = textOf(tr.cells[eventCol + s]);
      const at = event.search(/Decision on Manuscript ID/i);
      if (at < 0 || !/successfully sent/i.test(event)) continue;
      const ref = parseManuscriptId(event.slice(at).replace(/-\s+/g, '-'), idPattern);
      const date = DATE.exec(textOf(tr.cells[dateCol + s]))?.[0];
      // Newest first in MC's list; keep the first (latest) letter per version.
      if (ref && date && !out.has(ref.id)) out.set(ref.id, date);
    }
  }
  return out;
}

/** The "Audit Trail" tab on a manuscript's details page, if there is one. */
export function findAuditTrailLink(doc: Document): HTMLElement | null {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('a, [onclick], img[alt], img[title]'))) {
    const label = normalizeLabel(textOf(el) || el.getAttribute('alt') || el.getAttribute('title') || '');
    if (label === 'audit trail') return el.closest<HTMLElement>('a, [onclick]') ?? el;
  }
  return null;
}

function normalizeLabel(s: string): string {
  return labelKey(s).replace(/\s+/g, ' ');
}
