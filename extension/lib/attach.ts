// Press Attach after a file is chosen. MC's upload pages make the person
// choose a file and then press a separate Attach control. One delegated
// "change" listener watches every file input; when one gets a file, we look
// for its Attach control, nearest first (the input's row, its table, its
// form), and click it through pageClick, since MC's links are javascript:
// URLs that a content script can't click itself. The click waits a moment
// so MC's own change handlers run first. Nothing is clicked when no control
// is found, when it's ambiguous, or when it's disabled.

import { pageClick } from './click';
import { textOf } from './text';

const CONTROLS = 'button, input[type=button], input[type=submit], input[type=image], a, [onclick]';
export const ATTACH_DELAY_MS = 150;

function labelOf(el: Element): string {
  const parts = [textOf(el), el.getAttribute('value'), el.getAttribute('alt'), el.getAttribute('title')];
  // An image inside a link labels the link.
  for (const img of Array.from(el.querySelectorAll('img[alt]'))) parts.push(img.getAttribute('alt'));
  return parts.map((p) => (p ?? '').trim().toLowerCase()).find((p) => p.startsWith('attach')) ?? '';
}

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled');
}

/** The Attach control that belongs to this file input, or null. */
export function findAttachControl(input: HTMLInputElement): HTMLElement | null {
  const scopes = [input.closest('tr'), input.closest('table'), input.form ?? input.closest('form')];
  for (const scope of scopes) {
    if (!scope) continue;
    // Outermost match only, so a link and the image inside it count once.
    const found = Array.from(scope.querySelectorAll<HTMLElement>(CONTROLS)).filter((el) => el !== input && labelOf(el));
    const matches = found.filter((el) => !found.some((o) => o !== el && o.contains(el)));
    if (!matches.length) continue;
    const after = matches.filter((el) => input.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    // Two candidates after the input with no row to tell them apart: guess no.
    if (after.length > 1 && scope !== scopes[0]) return null;
    const pick = after[0] ?? (matches.length === 1 ? matches[0]! : null);
    if (!pick || isDisabled(pick)) return null;
    return pick;
  }
  return null;
}

/**
 * Watch the document for files being chosen. `enabled` is checked on every
 * change, so the setting and the per-site switch apply at once. Returns a
 * function that stops watching.
 */
export function watchFileAttach(doc: Document, enabled: () => boolean, onAttach?: (found: boolean) => void): () => void {
  const listener = (e: Event) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return;
    if (!enabled()) return;
    const control = findAttachControl(input);
    onAttach?.(!!control);
    if (control) setTimeout(() => pageClick(control), ATTACH_DELAY_MS);
  };
  doc.addEventListener('change', listener, true);
  return () => doc.removeEventListener('change', listener, true);
}
