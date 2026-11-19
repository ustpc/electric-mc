// Clickable manuscript IDs on queue grids. MC's grids open a manuscript only
// through the small Take Action checkbox at the end of the row; we turn the
// ID at the start of the row into a link that presses that same control.
// The click goes through pageClick, since MC's action is a javascript: link.

import { pageClick } from './click';
import { EMC_STYLE } from './milestones';
import { takeActionGrids } from './grid';

const MARK = 'id-link';

/** Link every ID on Take Action grids. Returns how many were linked. */
export function linkIds(doc: Document, idPattern?: string): number {
  let n = 0;
  for (const { rows } of takeActionGrids(doc, idPattern)) {
    for (const { idCell, ref, action } of rows) {
      if (!action || idCell.querySelector(`[data-electric-mc="${MARK}"]`)) continue;
      if (wrapId(doc, idCell, ref.id, action)) n++;
    }
  }
  return n;
}

/** Wrap the ID's text in a link that presses `action`. */
function wrapId(doc: Document, cell: Element, id: string, action: HTMLElement): boolean {
  const walker = doc.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const at = node.data.indexOf(id);
    if (at < 0) continue;
    const range = doc.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + id.length);
    const a = doc.createElement('a');
    a.href = '#';
    a.setAttribute('data-electric-mc', MARK);
    a.title = 'Open (same as Take Action)';
    // E-MC's brown, like everything else the extension adds to MC's pages.
    a.style.cssText = `${EMC_STYLE};text-decoration:underline;cursor:pointer`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      pageClick(action);
    });
    range.surroundContents(a);
    return true;
  }
  return false;
}

/** Undo linkIds. */
export function unlinkIds(doc: Document): void {
  doc.querySelectorAll(`a[data-electric-mc="${MARK}"]`).forEach((a) => a.replaceWith(...Array.from(a.childNodes)));
}

/** Each ID on Take Action grids, in page order, with its row's Take Action control. */
export function gridActions(doc: Document, idPattern?: string): Array<{ id: string; action: HTMLElement }> {
  const out: Array<{ id: string; action: HTMLElement }> = [];
  for (const { rows } of takeActionGrids(doc, idPattern)) {
    for (const { ref, action } of rows) if (action && !out.some((x) => x.id === ref.id)) out.push({ id: ref.id, action });
  }
  return out;
}
