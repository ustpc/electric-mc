// The AEs of a revision's earlier versions, where the co-chair assigns one.
// On the Assign AE page MC shows an empty "Associate Editor List" and the
// pull-down, but not who handled the earlier versions. We add a row to that
// list naming them (from what was recorded when those versions were viewed),
// and lib/aemenu.ts puts them at the top of the pull-down.

import { findAeSelect } from './aeload';
import { EMC_STYLE, versionName } from './milestones';
import { textOf } from './text';

export interface EarlierAe {
  /** The earlier version's ID, such as XYZJ-2026-0001 for the original. */
  id: string;
  /** Its AE, as MC names them; undefined when it was never recorded. */
  ae?: string;
}

/** The IDs of a revision's earlier versions, newest first (R2 -> R1, original). */
export function earlierIds(baseId: string, revision: number): string[] {
  const out: string[] = [];
  for (let r = revision - 1; r >= 0; r--) out.push(r === 0 ? baseId : `${baseId}.R${r}`);
  return out;
}

const ROW = 'earlier-ae';

/** One line per earlier version: "Original Associate Editor: Editor, Pat". */
export function earlierAeLines(list: EarlierAe[]): string[] {
  return list.map((v) => `${versionName(v.id)} Associate Editor: ${v.ae ?? 'not recorded yet (open that version once)'}`);
}

/**
 * Add (or refresh) a row at the top of the Associate Editor List, just above
 * the row with the AE pull-down. Returns whether it is on the page.
 */
export function markAeList(doc: Document, list: EarlierAe[]): boolean {
  const found = findAeSelect(doc);
  const existing = Array.from(doc.querySelectorAll<HTMLElement>(`[data-electric-mc="${ROW}"]`));
  if (!found || !list.length) {
    existing.forEach((e) => e.remove());
    return false;
  }
  const lines = earlierAeLines(list);
  const want = lines.join('\n');
  // The table that holds the list: the nearest one around the pull-down
  // whose heading says so, else the pull-down's own table.
  let table: HTMLTableElement | null = found.select.closest('table');
  for (let t = table; t; t = t.parentElement?.closest('table') ?? null) {
    if (/associate editor list/i.test(textOf(t).slice(0, 300))) {
      table = t;
      break;
    }
  }
  const row = table && Array.from(table.rows).find((tr) => tr.contains(found.select));
  const here = existing.find((e) => e.isConnected && (row ? e.nextElementSibling === row : true));
  if (here && here.getAttribute('data-emc-lines') === want) return true;
  existing.forEach((e) => e.remove());
  if (!row) return false;

  const tr = doc.createElement('tr');
  tr.setAttribute('data-electric-mc', ROW);
  tr.setAttribute('data-emc-lines', want);
  const td = doc.createElement('td');
  td.colSpan = Math.max(1, ...Array.from(table!.rows).map((r) => Array.from(r.cells).reduce((n, c) => n + (c.colSpan || 1), 0)));
  td.style.cssText = `padding:6px 8px;${EMC_STYLE}`;
  lines.forEach((line, i) => {
    if (i) td.appendChild(doc.createElement('br'));
    td.appendChild(doc.createTextNode(line));
  });
  tr.appendChild(td);
  row.before(tr);
  return true;
}
