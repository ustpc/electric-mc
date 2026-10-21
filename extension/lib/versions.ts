// Earlier versions of a manuscript. On a revision's details page, the
// Version History table lists every earlier version with a "Switch Details"
// link, but the page shows only the current version's AE. Each version's AE
// and dates are recorded whenever its own page is viewed; for what isn't
// recorded, a link with a plain address is opened in a hidden frame. MC's
// script links are never clicked, because they navigate the whole tab.
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

/** The link's plain http(s) address, or null for a script link (javascript: or onclick only). */
export function plainHref(doc: Document, link: HTMLElement): string | null {
  const href = link instanceof HTMLAnchorElement ? link.getAttribute('href')?.trim() ?? '' : '';
  if (!href || /^(javascript:|#)/i.test(href)) return null;
  try {
    const u = new URL(href, doc.baseURI);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Open one version's details in a hidden frame and hand back its document.
 * Only links with a plain address are loaded. A script link is never
 * clicked: MC's scripts navigate the whole tab whatever the form's target,
 * which once switched the person's revision page to the original version.
 */
export function loadInHiddenFrame(doc: Document, link: HTMLElement, timeoutMs = 20_000): Promise<Document> {
  const href = plainHref(doc, link);
  if (!href) return Promise.reject(new Error('script link not loaded in the background'));
  return new Promise((resolve, reject) => {
    const frame = doc.createElement('iframe');
    frame.setAttribute('data-electric-mc', 'version-frame');
    frame.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;visibility:hidden';
    doc.body.appendChild(frame);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
      setTimeout(() => frame.remove(), 0);
    };
    const timer = setTimeout(() => done(() => reject(new Error('timed out'))), timeoutMs);
    frame.addEventListener('load', () => {
      const d = frame.contentDocument;
      if (d && d.body && d.location.href !== 'about:blank') done(() => resolve(d));
    });
    frame.src = href;
  });
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
