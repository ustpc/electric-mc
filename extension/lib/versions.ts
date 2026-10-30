// Earlier versions of a manuscript. On a revision's details page, the
// Version History table lists every earlier version with a "Switch Details"
// link, but the page shows only the current version's AE. Each version's AE
// and dates are recorded whenever its own page is viewed. Nothing is loaded
// in the background: MC's Switch Details links navigate the whole tab, and
// loading MC pages beside the person's tab logged them out.
//
// Where the backend already knows (from the assignment emails), the content
// script asks it first and only falls back to this.

import { findManuscriptIds, type ManuscriptRef } from './ids';
import { EMC_STYLE } from './milestones';
import { labelKey, textOf } from './text';

export interface VersionLink {
  ref: ManuscriptRef;
  row: HTMLTableRowElement;
  link: HTMLElement;
  /** The version's "Date Submitted" from the table, when it has that column. */
  submitted?: string;
}

/** Earlier versions listed in the Version History table, newest first. */
export function findVersionLinks(doc: Document, current: ManuscriptRef, idPattern?: string): VersionLink[] {
  const out: VersionLink[] = [];
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const headerRow = Array.from(table.rows).find((tr) => Array.from(tr.cells).some((c) => /switch details|manuscript id/.test(labelKey(textOf(c)))));
    if (!headerRow) continue;
    const headers = Array.from(headerRow.cells).map((c) => labelKey(textOf(c)));
    const idCol = headers.findIndex((h) => h === 'manuscript id');
    const switchCol = headers.findIndex((h) => h.startsWith('switch'));
    if (idCol < 0 || switchCol < 0) continue;
    const dateCol = headers.findIndex((h) => h === 'date submitted' || h === 'submitted');
    for (const tr of Array.from(table.rows)) {
      if (tr === headerRow) continue;
      const ref = findManuscriptIds(textOf(tr.cells[idCol] ?? null), idPattern)[0];
      if (!ref || ref.baseId !== current.baseId || ref.id === current.id) continue;
      const cell = tr.cells[switchCol];
      const link = cell?.querySelector<HTMLElement>('a, button, input[type=image], img[onclick]');
      const submitted = dateCol >= 0 ? /\b\d{1,2}-[A-Z][a-z]{2}-\d{4}\b/.exec(textOf(tr.cells[dateCol] ?? null))?.[0] : undefined;
      if (link) out.push({ ref: { id: ref.id, baseId: ref.baseId, revision: ref.revision }, row: tr, link, submitted });
    }
  }
  return out.sort((a, b) => b.ref.revision - a.ref.revision);
}

/** Show each earlier version's AE next to its ID in the Version History table. */
export function annotateVersionRow(row: HTMLTableRowElement, idCellIndex: number, text: string): void {
  const cell = row.cells[idCellIndex] ?? row.cells[0];
  if (!cell) return;
  cell.querySelector('[data-electric-mc="version-ae"]')?.remove();
  const note = row.ownerDocument.createElement('div');
  note.setAttribute('data-electric-mc', 'version-ae');
  note.style.cssText = `font-size:90%;margin-top:2px;${EMC_STYLE}`;
  note.textContent = text;
  cell.appendChild(note);
}
