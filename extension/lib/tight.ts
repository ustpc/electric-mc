// Tight mode (off by default; asked for by the EIC, who found too much of
// MC's screen taken by things that aren't useful). On every MC page:
// - the journal logo bar (div.logoBar holding div.container with the logo)
//   folds away after a second;
// - the row with MC's page instructions (td.instructions, "The tabs below
//   organize…") goes;
// - rows that hold nothing at all (MC's spacing rows) go, and the main
//   column's 15px cell padding becomes 4px.
// Elements are marked always; one attribute on <html> switches the setting,
// so turning it on or off applies at once.

import { currentPage } from './mcpage';

const MARK = 'data-emc-tight';
const ON = 'data-emc-tight-on';
const LOGO_GONE = 'data-emc-tight-logo';
const STYLE_ID = 'emc-tight-style';
export const LOGO_DELAY_MS = 1000;

const CSS = `
[${MARK}="logo"] { interpolate-size: allow-keywords; overflow: clip;
  transition: block-size 0.3s ease-out, opacity 0.3s ease-out, display 0.3s; transition-behavior: allow-discrete; }
html[${ON}][${LOGO_GONE}] [${MARK}="logo"] { block-size: 0; opacity: 0; display: none; }
html[${ON}] :is([${MARK}="row"], [${MARK}="empty"]) { display: none !important; }
html[${ON}] [${MARK}="pad"] > tbody > tr > td { padding: 4px !important; }
@media (prefers-reduced-motion: reduce) { [${MARK}="logo"] { transition-duration: 0s; } }
`;

/** Elements that make a row worth keeping even with no text. */
const CONTENT = 'img, input, select, textarea, button, iframe, object, embed, canvas, svg, video, a[name], [id], [data-electric-mc]';

let logoTimer: ReturnType<typeof setTimeout> | undefined;

export function tightMode(doc: Document, on: boolean): { logo: boolean; instructions: number; empty: number } {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-electric-mc', 'tight');
    style.textContent = CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  const counts = { logo: false, instructions: 0, empty: 0 };

  // The journal logo bar (div.logoBar > div.container > the logo) and
  // nothing else: the login page shows the same logo again inside the
  // div.container that holds the login form.
  for (const bar of Array.from(doc.querySelectorAll<HTMLElement>('div.logoBar'))) {
    if (!bar.querySelector('img[src*="/societyimages/"], img[alt="Journal logo"]')) continue;
    if (bar.querySelector('form, input:not([type=hidden]), select, textarea, button:not(.btn-navbar)')) continue;
    bar.setAttribute(MARK, 'logo');
    counts.logo = true;
  }

  // MC's instructions row, when it holds only words and links; not on a
  // popup such as Instructions & Forms, where the instructions are the page.
  const popup = /POPUP/i.test(currentPage(doc) ?? '');
  for (const td of Array.from(doc.querySelectorAll<HTMLTableCellElement>('td.instructions'))) {
    const row = td.parentElement;
    if (popup || !row || row.tagName !== 'TR') continue;
    if (td.querySelector('table, form, input, select, textarea, button, iframe')) continue;
    if ((td.textContent ?? '').length > 2000) continue;
    row.setAttribute(MARK, 'row');
    counts.instructions++;
  }

  // The main column's padding, and rows with nothing in them.
  for (const t of Array.from(doc.querySelectorAll<HTMLTableElement>('table[cellpadding="15"]'))) t.setAttribute(MARK, 'pad');
  // Checked again on every run: MC fills some rows in later.
  for (const row of Array.from(doc.querySelectorAll<HTMLTableRowElement>('body tr'))) {
    const mark = row.getAttribute(MARK);
    if (mark === 'row' || row.closest('[data-electric-mc]')) continue;
    const empty = !(row.textContent ?? '').trim() && !row.querySelector(CONTENT);
    if (empty) {
      row.setAttribute(MARK, 'empty');
      counts.empty++;
    } else if (mark === 'empty') row.removeAttribute(MARK);
  }

  const html = doc.documentElement;
  if (on) {
    html.setAttribute(ON, '');
    if (!html.hasAttribute(LOGO_GONE) && logoTimer === undefined) {
      const view = doc.defaultView;
      logoTimer = (view ?? globalThis).setTimeout(() => {
        logoTimer = undefined;
        if (html.hasAttribute(ON)) html.setAttribute(LOGO_GONE, '');
      }, LOGO_DELAY_MS);
    }
  } else {
    html.removeAttribute(ON);
    html.removeAttribute(LOGO_GONE);
    if (logoTimer !== undefined) clearTimeout(logoTimer);
    logoTimer = undefined;
  }
  return counts;
}
