// MC's Prophy reviewer suggestions have a bug (confirmed 2026-11-26 with
// E-MC switched off): their "Add as reviewer (create account)" button opens
// a Create Account popup whose document ID is wrong (it holds the reviewer
// source type, not the manuscript). After Create and Add, MC reloads the
// manuscript as "Details for null" and every later add fails until the
// manuscript is opened again. The Web of Science "+Add" link and "+ Add New
// Reviewer" carry the right ID. So we mark Prophy's button and ask before
// it opens that popup. Nothing MC sends or receives is changed.

import { onClick, type ClickBus } from './clickbus';
import { textOf } from './text';
import { EMC_COLOR } from './ui';

const MARK = 'data-emc-prophy-add';
const STYLE_ID = 'emc-prophy-style';

export const PROPHY_WARNING =
  'MC bug: this Prophy "Add as reviewer (create account)" button loses the manuscript. After Create and Add, MC shows "Details for null" and later adds fail.\n\n' +
  'Use "+Add" in the Web of Science Reviewer Locator box (open the box if it is closed) or "+ Add New Reviewer" instead.\n\nOpen the Prophy popup anyway?';

/** Prophy's create-account button: a <button> labelled "Add as reviewer (create account)". */
export function prophyAddButton(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('button') : null;
  if (!el) return null;
  const label = `${el.getAttribute('aria-label') ?? ''} ${textOf(el)}`;
  return /add as reviewer \(create account\)/i.test(label) ? el : null;
}

/** Mark every such button on the page (or unmark them). Returns how many. */
export function markProphyAdd(doc: Document, on: boolean): number {
  const buttons = Array.from(doc.querySelectorAll<HTMLElement>('button')).filter((b) => prophyAddButton(b) === b);
  if (!on) {
    doc.querySelectorAll(`[${MARK}]`).forEach((b) => {
      b.removeAttribute(MARK);
      if (b.getAttribute('title')?.startsWith('MC bug')) b.removeAttribute('title');
    });
    doc.getElementById(STYLE_ID)?.remove();
    return 0;
  }
  if (buttons.length && !doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-electric-mc', 'prophy');
    style.textContent = `[${MARK}] { outline: 2px dashed ${EMC_COLOR} !important; outline-offset: 2px; }`;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  // Only buttons not yet marked: setting an attribute again would still
  // count as a page change and run the page script again.
  for (const b of buttons) {
    if (b.hasAttribute(MARK)) continue;
    b.setAttribute(MARK, '');
    if (!b.getAttribute('title')) b.setAttribute('title', 'MC bug: this button loses the manuscript. Use "+Add" in the Web of Science box or "+ Add New Reviewer".');
  }
  return buttons.length;
}

/**
 * Ask before a press on Prophy's create-account button reaches MC. A
 * cancelled press is stopped. Returns a function that stops watching.
 */
export function watchProphyAdd(doc: Document, enabled: () => boolean, ask: (message: string) => boolean, log?: (data: Record<string, unknown>) => void, bus?: ClickBus): () => void {
  return onClick(doc, bus, 'guard', (e: MouseEvent) => {
    if (!enabled() || !prophyAddButton(e.target)) return;
    const go = ask(PROPHY_WARNING);
    log?.({ go });
    if (go) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  });
}
