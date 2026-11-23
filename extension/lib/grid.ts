// MC's Take Action grids: queue lists and search results are tables with a
// "Take Action" column, one manuscript per row, its ID in the first cell.
// Read in one place for the clickable IDs (idlink), auto-advance's order of
// manuscripts and opening the single search result (search).

import { parseManuscriptId, type ManuscriptRef } from './ids';
import { labelKey, textOf } from './text';

export interface GridRow {
  tr: HTMLTableRowElement;
  idCell: HTMLTableCellElement;
  ref: ManuscriptRef;
  /** The row's Take Action control, when it has one. */
  action: HTMLElement | null;
}

export interface Grid {
  table: HTMLTableElement;
  /** Rows below the header that start with a manuscript ID (a "Search Criteria" line above it doesn't count). */
  rows: GridRow[];
}

const isAction = (c: Element) => labelKey(textOf(c)) === 'take action';

/** Every Take Action grid on the page, outermost tables' own rows only. */
export function takeActionGrids(doc: Document, idPattern?: string): Grid[] {
  const out: Grid[] = [];
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const all = Array.from(table.rows).filter((tr) => tr.closest('table') === table);
    const h = all.findIndex((tr) => Array.from(tr.cells).some(isAction));
    if (h < 0) continue;
    const col = Array.from(all[h]!.cells).findIndex(isAction);
    const rows: GridRow[] = [];
    for (const tr of all.slice(h + 1)) {
      const idCell = tr.cells[0];
      const ref = idCell ? parseManuscriptId(textOf(idCell), idPattern) : null;
      if (!idCell || !ref) continue;
      const cell = tr.cells[col] ?? tr.cells[tr.cells.length - 1];
      rows.push({ tr, idCell, ref, action: cell?.querySelector<HTMLElement>('a, button, input[type=image], img[onclick]') ?? null });
    }
    out.push({ table, rows });
  }
  return out;
}
