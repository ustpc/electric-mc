// Text buttons (issue #2). MC draws its buttons as GIF images with the
// words baked in (/images/en_US/buttons/save.gif and so on), so they don't
// grow with E-MC's text size and can't be restyled. For each button image
// we know, E-MC adds a real text button beside it, labelled from the
// image's name, and hides the image. Commit Decision is drawn bigger, in
// the E-MC color.
//
// The image stays in the page, hidden, inside MC's own link, and a click
// on the text button is passed on to it, so MC sees the click it expects.
// Images we don't know (create_draft_email_done, ...) are left alone, and
// an image whose src changes to one we don't know gets its picture back.
// One attribute on <html> switches the setting, so turning it off shows
// MC's images again at once.

import { pageClick } from './click';
import { EMC_COLOR } from './ui';

const MARK = 'data-emc-textbtn';
const ON = 'data-emc-textbtn-on';
const STYLE_ID = 'emc-textbtn-style';
const KIND = 'textbtn';

/** MC button image name to the words drawn in it. */
export const BUTTON_LABELS: Record<string, string> = {
  add_a_note: 'Add a Note',
  close_message: 'Close',
  close_window: 'Close Window',
  commit_decision: 'Commit Decision',
  create_draft_email: 'Create Draft E-Mail',
  edit: 'Edit',
  export_to_csv: 'Export to CSV',
  pick: 'Pick',
  print: 'Print',
  save: 'Save',
  search: 'Search',
  submit: 'Submit',
  assign: 'Assign',
};

/** Buttons drawn larger and in the E-MC color. */
const PRIMARY = new Set(['commit_decision']);

const CSS = `
html[${ON}] img[${MARK}] { display: none !important; }
html:not([${ON}]) [data-electric-mc="${KIND}"] { display: none !important; }
[data-electric-mc="${KIND}"] {
  display: inline-block; box-sizing: border-box; margin: 2px; padding: 0.25em 0.8em;
  font: inherit; font-size: 1em; line-height: 1.3; white-space: nowrap; cursor: pointer;
  color: #1f2937; background: #f3f4f6; border: 1px solid #9ca3af; border-radius: 0.35em;
  text-decoration: none !important; user-select: none; vertical-align: middle;
}
[data-electric-mc="${KIND}"]:hover { background: #e5e7eb; border-color: #6b7280; }
[data-electric-mc="${KIND}"]:focus-visible { outline: 2px solid ${EMC_COLOR}; outline-offset: 2px; }
[data-electric-mc="${KIND}"][data-primary] {
  font-size: 1.3em; font-weight: 700; padding: 0.4em 1.2em;
  color: #fff; background: ${EMC_COLOR}; border-color: ${EMC_COLOR};
}
[data-electric-mc="${KIND}"][data-primary]:hover { background: #92400e; border-color: #92400e; }
`;

const SELECTOR = 'img[src*="/images/en_US/buttons/"]';

/** The button name from an MC button image src, or null. */
export function buttonName(src: string | null): string | null {
  const m = /\/images\/en_US\/buttons\/([A-Za-z0-9_-]+)\.gif(?:[?#]|$)/.exec(src ?? '');
  return m?.[1] ? m[1].toLowerCase() : null;
}

const observers = new WeakMap<Document, MutationObserver>();

function buttonFor(img: HTMLImageElement): HTMLElement | null {
  const next = img.nextElementSibling;
  return next instanceof HTMLElement && next.getAttribute('data-electric-mc') === KIND ? next : null;
}

function unmark(img: HTMLImageElement): void {
  img.removeAttribute(MARK);
  buttonFor(img)?.remove();
}

/** Give one image its text button, or take it away. Returns true when it has one. */
function sync(img: HTMLImageElement): boolean {
  const name = buttonName(img.getAttribute('src'));
  const label = name ? BUTTON_LABELS[name] : undefined;
  if (!name || !label || img.closest('[data-electric-mc]')) {
    if (img.hasAttribute(MARK)) unmark(img);
    return false;
  }
  let btn = buttonFor(img);
  if (img.getAttribute(MARK) === name && btn) return true;
  btn?.remove();
  const doc = img.ownerDocument;
  btn = doc.createElement('span');
  btn.setAttribute('data-electric-mc', KIND);
  btn.setAttribute('role', 'button');
  btn.textContent = label;
  if (PRIMARY.has(name)) btn.setAttribute('data-primary', '');
  // Every click goes to the image itself, from the page's own world, so
  // MC's handlers run whether they sit on the image (Create Draft E-Mail)
  // or on the link around it (javascript: links). Inside a link, the link
  // is what the keyboard reaches; elsewhere the text button takes focus.
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pageClick(img);
  });
  if (!img.closest('a, button')) {
    btn.tabIndex = 0;
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pageClick(img);
      }
    });
  }
  img.setAttribute(MARK, name);
  img.after(btn);
  return true;
}

export function textButtons(doc: Document, on: boolean): { buttons: number } {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-electric-mc', 'textbtn-style');
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  const html = doc.documentElement;
  if (!on) {
    html.removeAttribute(ON);
    observers.get(doc)?.disconnect();
    observers.delete(doc);
    for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>(`img[${MARK}]`))) unmark(img);
    return { buttons: 0 };
  }
  let buttons = 0;
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>(SELECTOR))) if (sync(img)) buttons++;
  // Images that change their picture (Create Draft E-Mail turns into its
  // "done" image) between runs.
  if (!observers.has(doc) && typeof MutationObserver !== 'undefined') {
    const obs = new MutationObserver((records) => {
      for (const r of records) if (r.target instanceof HTMLImageElement && r.target.hasAttribute(MARK)) sync(r.target);
    });
    obs.observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['src'] });
    observers.set(doc, obs);
  }
  html.setAttribute(ON, '');
  return { buttons };
}
