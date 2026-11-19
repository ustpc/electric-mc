// Warn before a decision or recommendation goes out with no comment to the
// author. When the person presses Submit in a "… Recommends" table or
// Commit Decision in a "… Decision" box (lib/advance.ts decides which
// presses those are), the choice made is of the accept/reject kind, and the
// page's "Comments to the Author" box is empty, we ask first. Cancel stops
// the press before MC (or our own auto-advance) sees it.

import { isRecommendationSubmit } from './advance';
import { commentBoxes, pickedLabel } from './recommendform';

/** Choices that are decisions about the paper itself. */
const VERDICT = /\b(accept|reject|revis|resubmit)/i;

/** The page's comment-to-author boxes. */
export function authorBoxes(doc: Document): HTMLTextAreaElement[] {
  return commentBoxes(doc).author;
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
  const choice = pickedLabel(doc);
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
  box?.scrollIntoView?.({ block: 'center' });
  box?.focus();
}
