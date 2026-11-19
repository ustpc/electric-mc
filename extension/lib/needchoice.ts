// Don't let a recommendation or decision go out with no choice made. MC
// accepts Submit in a "… Recommends" table (and Commit Decision in a
// "… Decision" box) with none of the radio buttons picked, and records an
// empty recommendation. When such a press comes with choices on the page and
// none picked, we stop it and say so in the E-MC color next to the choices.

import { onClick, type ClickBus } from './clickbus';
import { choiceRadios, submitControl } from './recommendform';
import { EMC_COLOR } from './ui';

export const NEED_CHOICE_ID = 'electric-mc-need-choice';

/**
 * Whether a press sends a recommendation or decision while the page offers
 * choices and none is picked. A page with no radio buttons isn't stopped:
 * we can't tell what the choice would be.
 */
export function missingChoice(target: EventTarget | null): boolean {
  const control = submitControl(target);
  if (!control) return false;
  const radios = choiceRadios(control.ownerDocument);
  return radios.length > 0 && !radios.some((r) => r.checked);
}

/** Show the message just above the choices, once, and bring it into view. */
export function showNeedChoice(doc: Document): HTMLElement | null {
  const first = choiceRadios(doc)[0];
  if (!first) return null;
  let note = doc.getElementById(NEED_CHOICE_ID);
  if (!note) {
    note = doc.createElement('div');
    note.id = NEED_CHOICE_ID;
    note.setAttribute('data-electric-mc', '');
    note.setAttribute('role', 'alert');
    note.style.cssText = `color:${EMC_COLOR} !important;font-weight:700 !important;border:2px solid ${EMC_COLOR};padding:6px 10px;margin:6px 0;background:#fff;`;
    note.textContent = 'Electric MC: pick one of the choices below before you submit. Nothing was sent.';
    const anchor = first.closest('table') ?? first.parentElement;
    anchor?.parentElement?.insertBefore(note, anchor);
  }
  note.scrollIntoView?.({ block: 'center' });
  return note;
}

/**
 * Watch for such presses and stop them. Register before every other capture
 * listener on the document (the no-comment warning, auto-advance) so a
 * stopped press reaches none of them. Picking a choice removes the message.
 * Returns a function that stops watching.
 */
export function watchMissingChoice(doc: Document, enabled: () => boolean, log?: (data: Record<string, unknown>) => void, bus?: ClickBus): () => void {
  const onPress = (e: MouseEvent) => {
    if (!enabled() || !missingChoice(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showNeedChoice(doc);
    log?.({ choices: choiceRadios(doc).length });
  };
  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement | null;
    if (t?.type === 'radio' && t.checked) doc.getElementById(NEED_CHOICE_ID)?.remove();
  };
  const off = onClick(doc, bus, 'guard', onPress);
  doc.addEventListener('change', onChange, true);
  return () => {
    off();
    doc.removeEventListener('change', onChange, true);
  };
}
