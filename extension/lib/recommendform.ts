// MC's recommendation and decision forms, read in one place: the "…
// Recommends" or "… Decision" heading and whose it is, the choices (radio
// rows) and the one picked, the Submit or Commit Decision control, and the
// comment boxes. The guards (needchoice, authorcomment), the To EIC
// recorder (recommend), auto-advance and one-button reject all read the
// form through here, so they can't disagree about it.

import { labelKey, textOf } from './text';

const HEADING_TAGS = 'th, td, div, span, b, h2, h3, h4';

/** The page's short heading-like texts, as label keys ("co-chair recommends"). */
export function headingKeys(doc: Document, skip?: Element): string[] {
  return Array.from(doc.querySelectorAll(HEADING_TAGS))
    .filter((e) => e.children.length <= 2 && textOf(e).length < 60 && !(skip && (skip.contains(e) || e.contains(skip))))
    .map((e) => labelKey(textOf(e)));
}

/** Whose "… Recommends" form the page shows: the co-chair's, or another role's (the AE's). Null when none. */
export function recommendsRole(doc: Document): 'cc' | 'other' | null {
  const heads = headingKeys(doc).filter((t) => /recommends$/.test(t));
  if (!heads.length) return null;
  return heads.some((t) => /co-?chair/.test(t)) ? 'cc' : 'other';
}

/** The page's own radio buttons (not ours). */
export function choiceRadios(doc: Document): HTMLInputElement[] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type=radio]')).filter((r) => !r.closest('[data-electric-mc]'));
}

/** A choice's label: the text of its table row (or the nearest row with text). */
export function choiceLabel(radio: HTMLInputElement): string {
  for (let tr = radio.closest('tr'); tr; tr = tr.parentElement?.closest('tr') ?? null) {
    const t = textOf(tr).replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  return textOf(radio.parentElement).replace(/\s+/g, ' ').trim();
}

/** The label of the picked choice, or '' when none is picked. */
export function pickedLabel(doc: Document): string {
  const radio = choiceRadios(doc).find((r) => r.checked);
  return radio ? choiceLabel(radio) : '';
}

/**
 * The Submit or Commit Decision control a press is on, when the page has a
 * matching "… Recommends" or "… Decision" heading, whether or not a choice
 * is made yet; otherwise null.
 */
export function submitControl(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest('a, button, input[type=submit], input[type=button], input[type=image]');
  if (!control) return null;
  const label = labelKey(textOf(control) || control.getAttribute('value') || control.getAttribute('alt') || control.querySelector('img')?.getAttribute('alt') || '');
  const heading = label === 'submit' ? /recommends$/ : /^(commit|submit) decision$/.test(label) ? /(recommends|decision)$/ : null;
  if (!heading) return null;
  return headingKeys(control.ownerDocument, control).some((t) => heading.test(t)) ? control : null;
}

/** A press that sends a recommendation or decision with a choice picked. */
export function isSubmitWithChoice(target: EventTarget | null): boolean {
  const control = submitControl(target);
  return !!control && choiceRadios(control.ownerDocument).some((r) => r.checked);
}

/** The text just before an element in document order, up to `max` characters. */
function textBefore(el: Element, max = 160): string {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  let out = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) break;
    if (el.contains(n)) continue;
    const p = n.parentElement;
    if (p && (p.closest('script, style, option, [data-electric-mc]') || p.closest('textarea'))) continue;
    out = (out + ' ' + (n.textContent ?? '')).replace(/\s+/g, ' ').slice(-max);
  }
  return out;
}

/** Who a comment box is for, by its name (MC's …COMMENTS_TO_AUTHOR) or, failing that, its label. */
export function boxAudience(box: HTMLTextAreaElement): 'author' | 'editor' | null {
  if (/COMMENTS_TO_AUTHOR$/i.test(box.name)) return 'author';
  if (/COMMENTS_TO_EDITOR$/i.test(box.name)) return 'editor';
  const own = `${box.name} ${box.id} ${box.getAttribute('aria-label') ?? ''} ${box.title}`;
  if (/author/i.test(own)) return /editor|confidential/i.test(own) ? 'editor' : 'author';
  if (/editor|confidential/i.test(own)) return 'editor';
  const before = textBefore(box).toLowerCase();
  const a = before.lastIndexOf('author');
  const e = Math.max(before.lastIndexOf('editor'), before.lastIndexOf('confidential'));
  if (a >= 0 && a > e) return 'author';
  return e >= 0 ? 'editor' : null;
}

/** The form's comment boxes for the author and for the editor (the first of each). */
export function commentBoxes(doc: Document): { toAuthor: HTMLTextAreaElement | null; toEditor: HTMLTextAreaElement | null; author: HTMLTextAreaElement[] } {
  const boxes = Array.from(doc.querySelectorAll<HTMLTextAreaElement>('textarea')).filter((t) => !t.closest('[data-electric-mc]'));
  const author = boxes.filter((b) => boxAudience(b) === 'author');
  return { toAuthor: author[0] ?? null, toEditor: boxes.find((b) => boxAudience(b) === 'editor') ?? null, author };
}
