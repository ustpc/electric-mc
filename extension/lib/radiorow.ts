// Click anywhere in a radio-button row. MC's choice tables (Co-Chair
// Recommends, decision lists, …) put a small radio button in one cell and
// its label in the next, and only the button itself responds. One delegated
// click listener selects a row's radio button when the person clicks
// elsewhere in that row. Only rows with exactly one radio button count, and
// clicks on links, buttons, fields and labels are left alone. The radio is
// pressed through pageClick, so MC's own onclick handlers run as usual.

import { pageClick } from './click';

const INTERACTIVE = 'a, button, input, select, textarea, label, [onclick], [contenteditable]';
const STYLE_ID = 'emc-radio-rows';
// Rows that hold a radio button show the hand cursor.
const CSS = 'tr:has(> td > input[type=radio]) { cursor: pointer; }';

/** The one radio button in the row a click landed in, or null. */
export function radioForClick(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof Element) || target.closest(INTERACTIVE)) return null;
  const tr = target.closest('tr');
  if (!tr) return null;
  // Only this row's own cells, not radio buttons in a table nested inside it.
  const radios = Array.from(tr.querySelectorAll<HTMLInputElement>('input[type=radio]')).filter((r) => r.closest('tr') === tr);
  if (radios.length !== 1) return null;
  const radio = radios[0]!;
  return radio.disabled ? null : radio;
}

/**
 * Watch the document for clicks in radio-button rows. `enabled` is checked
 * on every click, so the per-site switch applies at once. Returns a
 * function that stops watching.
 */
export function watchRadioRows(doc: Document, enabled: () => boolean): () => void {
  const listener = (e: MouseEvent) => {
    if (e.button !== 0 || e.defaultPrevented || !enabled()) return;
    const radio = radioForClick(e.target);
    if (!radio || radio.checked) return;
    pageClick(radio);
  };
  doc.addEventListener('click', listener);
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  return () => {
    doc.removeEventListener('click', listener);
    doc.getElementById(STYLE_ID)?.remove();
  };
}
