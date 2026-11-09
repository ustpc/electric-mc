// Click anywhere in a radio-button row. MC's choice tables (Co-Chair
// Recommends, decision lists, …) put a small radio button in one cell and
// its label in the next, and only the button itself responds. One delegated
// click listener selects a row's radio button when the person clicks
// elsewhere in that row. Only rows with exactly one radio button count, and
// clicks on links, buttons, fields and labels are left alone. The radio is
// pressed through pageClick, so MC's own onclick handlers run as usual.

import { pageClick } from './click';

const INTERACTIVE = 'a, button, input, select, textarea, label, [contenteditable]';
// MC puts onclick on whole tables, cells and paragraphs; only an onclick on
// something small (an icon, a span) means the click is meant for it.
const CONTAINERS = new Set(['TD', 'TH', 'TR', 'TBODY', 'THEAD', 'TABLE', 'P', 'DIV', 'FORM', 'BODY', 'HTML']);

/** Whether the click was meant for something between the target and the row. */
function interactiveBelow(target: Element, row: Element): boolean {
  for (let el: Element | null = target; el && el !== row; el = el.parentElement) {
    if (el.matches(INTERACTIVE)) return true;
    if (el.hasAttribute('onclick') && !CONTAINERS.has(el.tagName)) return true;
  }
  return false;
}
const STYLE_ID = 'emc-radio-rows';
// Rows that hold a radio button show the hand cursor.
const CSS = 'tr:has(> td > input[type=radio]) { cursor: pointer; }';

/** The one radio button in the row a click landed in, or null. */
export function radioForClick(target: EventTarget | null): HTMLInputElement | null {
  return radioRowClick(target).radio;
}

export interface RadioRowClick {
  radio: HTMLInputElement | null;
  /** Why no radio button was picked, for the log. */
  why?: string;
}

/** The radio button a click picks, or why it picks none. */
export function radioRowClick(target: EventTarget | null): RadioRowClick {
  if (!(target instanceof Element)) return { radio: null, why: 'not an element' };
  // MC often puts the label in a table of its own inside the row's second
  // cell, so walk out through enclosing rows until one has a radio button.
  for (let tr = target.closest('tr'); tr; tr = tr.parentElement?.closest('tr') ?? null) {
    // Only this row's own cells, not radio buttons in a table nested inside it.
    const radios = Array.from(tr.querySelectorAll<HTMLInputElement>('input[type=radio]')).filter((r) => r.closest('tr') === tr);
    if (!radios.length) continue;
    if (radios.length !== 1) return { radio: null, why: `${radios.length} radio buttons in the row` };
    if (interactiveBelow(target, tr)) return { radio: null, why: 'on a link or field' };
    const radio = radios[0]!;
    return radio.disabled ? { radio: null, why: 'disabled' } : { radio };
  }
  return { radio: null, why: 'no radio row' };
}

/**
 * Watch the document for clicks in radio-button rows. `enabled` is checked
 * on every click, so the per-site switch applies at once. Returns a
 * function that stops watching.
 */
export function watchRadioRows(doc: Document, enabled: () => boolean, log?: (data: Record<string, unknown>) => void): () => void {
  const listener = (e: MouseEvent) => {
    if (e.button !== 0 || !enabled()) return;
    const { radio, why } = radioRowClick(e.target);
    if (!radio) {
      // Only clicks that land in a row with the hand cursor are worth a line.
      if (why !== 'no radio row' && why !== 'not an element' && why !== 'on a link or field') log?.({ picked: false, why });
      return;
    }
    if (radio.checked) return;
    pageClick(radio);
    log?.({ picked: radio.checked, value: radio.value });
  };
  // Capture, so a page handler that stops the click can't hide it from us.
  doc.addEventListener('click', listener, true);
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  return () => {
    doc.removeEventListener('click', listener, true);
    doc.getElementById(STYLE_ID)?.remove();
  };
}
