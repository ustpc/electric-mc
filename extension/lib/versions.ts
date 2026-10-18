// Earlier versions of a manuscript. On a revision's details page, the
// Version History table lists every earlier version with a "Switch Details"
// link, but the page shows only the current version's AE. We find those
// links and open each one in a hidden frame, so the person never leaves the
// page, then read the AE from the loaded details page.
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
    for (const tr of Array.from(table.rows)) {
      if (tr === headerRow) continue;
      const ref = findManuscriptIds(textOf(tr.cells[idCol] ?? null), idPattern)[0];
      if (!ref || ref.baseId !== current.baseId || ref.id === current.id) continue;
      const cell = tr.cells[switchCol];
      const link = cell?.querySelector<HTMLElement>('a, button, input[type=image], img[onclick]');
      if (link) out.push({ ref: { id: ref.id, baseId: ref.baseId, revision: ref.revision }, row: tr, link });
    }
  }
  return out.sort((a, b) => b.ref.revision - a.ref.revision);
}

/**
 * Open one version's details in a hidden frame and hand back its document.
 * MC's links either point somewhere or run a script that fills in and
 * submits the page's form; pointing every form at the hidden frame for the
 * moment of the click catches both without navigating the page.
 */
export function loadInHiddenFrame(doc: Document, link: HTMLElement, timeoutMs = 20_000): Promise<Document> {
  return new Promise((resolve, reject) => {
    const name = `emc-version-${Math.random().toString(36).slice(2, 8)}`;
    const frame = doc.createElement('iframe');
    frame.name = name;
    frame.setAttribute('data-electric-mc', 'version-frame');
    frame.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;visibility:hidden';
    doc.body.appendChild(frame);
    let restore = () => {};
    const done = (fn: () => void) => {
      clearTimeout(timer);
      restore();
      fn();
      setTimeout(() => frame.remove(), 0);
    };
    const timer = setTimeout(() => done(() => reject(new Error('timed out'))), timeoutMs);
    frame.addEventListener('load', () => {
      const d = frame.contentDocument;
      if (d && d.body && d.location.href !== 'about:blank') done(() => resolve(d));
    });

    const href = link instanceof HTMLAnchorElement ? link.getAttribute('href') ?? '' : '';
    if (href && !/^(javascript:|#)/i.test(href)) {
      frame.src = new URL(href, doc.baseURI).href;
      return;
    }
    // The click's script may rewrite the form's hidden fields before
    // submitting. Hidden fields are put back once the frame has loaded, so
    // the page's own buttons still act on the version on screen. Fields the
    // person can type in are never touched.
    const forms = Array.from(doc.forms);
    const targets = forms.map((f) => f.getAttribute('target'));
    const hidden = Array.from(doc.querySelectorAll<HTMLInputElement>('form input[type=hidden]')).map((e) => [e, e.value] as const);
    forms.forEach((f) => f.setAttribute('target', name));
    let targetsBack = false;
    const restoreTargets = () => {
      if (targetsBack) return;
      targetsBack = true;
      forms.forEach((f, i) => {
        const t = targets[i];
        if (t === null || t === undefined) f.removeAttribute('target');
        else f.setAttribute('target', t);
      });
    };
    // If the click didn't submit (it opened a popup, say), don't leave the
    // forms pointing at the frame, or the person's next click would vanish.
    setTimeout(restoreTargets, 2000);
    restore = () => {
      restore = () => {};
      restoreTargets();
      for (const [e, v] of hidden) if (e.value !== v) e.value = v;
    };
    link.click();
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
