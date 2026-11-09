// Warn before a decision or recommendation goes out with no comment to the
// author. When the person presses Submit in a "… Recommends" table or
// Commit Decision in a "… Decision" box (lib/advance.ts decides which
// presses those are), the choice made is of the accept/reject kind, and the
// page's "Comments to the Author" box is empty, we ask first. Cancel stops
// the press before MC (or our own auto-advance) sees it.

import { isRecommendationSubmit } from './advance';
import { textOf } from './text';

/** Choices that are decisions about the paper itself. */
const VERDICT = /\b(accept|reject|revis|resubmit)/i;

/** The text just before an element in document order, up to `max` characters. */
function textBefore(el: Element, max = 160): string {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  let out = '';
  // Walk to the element, keeping a rolling window of the text before it.
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) break;
    if (el.contains(n)) continue;
    const p = n.parentElement;
    if (p && (p.closest('script, style, option, [data-electric-mc]') || p.closest('textarea'))) continue;
    out = (out + ' ' + (n.textContent ?? '')).replace(/\s+/g, ' ').slice(-max);
  }
  return out;
}

/** Whether a text box is for the author: its label says author, not editor. */
function isAuthorBox(box: HTMLTextAreaElement): boolean {
  const own = `${box.name} ${box.id} ${box.getAttribute('aria-label') ?? ''} ${box.title}`;
  if (/author/i.test(own)) return !/editor|confidential/i.test(own);
  const before = textBefore(box).toLowerCase();
  const a = before.lastIndexOf('author');
  return a >= 0 && a > before.lastIndexOf('editor') && a > before.lastIndexOf('confidential');
}

/** The page's comment-to-author boxes. */
export function authorBoxes(doc: Document): HTMLTextAreaElement[] {
  return Array.from(doc.querySelectorAll<HTMLTextAreaElement>('textarea')).filter((t) => !t.closest('[data-electric-mc]') && isAuthorBox(t));
}

/** The label of the chosen radio button: its row's text. */
export function chosenLabel(doc: Document): string {
  const radio = doc.querySelector<HTMLInputElement>('input[type=radio]:checked');
  if (!radio) return '';
  for (let tr = radio.closest('tr'); tr; tr = tr.parentElement?.closest('tr') ?? null) {
    const t = textOf(tr).trim();
    if (t) return t;
  }
  return textOf(radio.parentElement).trim();
}

export interface MissingComment {
  /** The choice made, such as "Reject". */
  choice: string;
}

/**
 * For a press that sends an accept/reject decision or recommendation while
 * every comment-to-author box is empty, what was chosen; otherwise null.
 * A page with no such box (MC's form varies) doesn't warn.
 */
export function missingAuthorComment(target: EventTarget | null): MissingComment | null {
  if (!isRecommendationSubmit(target)) return null;
  const doc = (target as Element).ownerDocument;
  const choice = chosenLabel(doc);
  if (!VERDICT.test(choice)) return null;
  const boxes = authorBoxes(doc);
  if (!boxes.length || boxes.some((b) => b.value.trim())) return null;
  return { choice };
}

/**
 * Watch for such presses and ask first. Register before other capture
 * listeners on the document (lib/advance.ts) so a cancelled press reaches
 * none of them. Returns a function that stops watching.
 */
export function watchAuthorComments(
  doc: Document,
  enabled: () => boolean,
  ask: (message: string) => boolean,
  log?: (data: Record<string, unknown>) => void,
): () => void {
  const listener = (e: MouseEvent) => {
    if (!enabled()) return;
    const missing = missingAuthorComment(e.target);
    if (!missing) return;
    const choice = missing.choice.length > 40 ? `${missing.choice.slice(0, 39)}…` : missing.choice;
    const send = ask(`Electric MC: there is no comment to the author with this "${choice}".\n\nSend it anyway?`);
    log?.({ choice, sent: send });
    if (send) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    boxesFocus(doc);
  };
  doc.addEventListener('click', listener, true);
  return () => doc.removeEventListener('click', listener, true);
}

function boxesFocus(doc: Document): void {
  const box = authorBoxes(doc)[0];
  box?.scrollIntoView({ block: 'center' });
  box?.focus();
}
