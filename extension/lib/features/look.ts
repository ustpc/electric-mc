// How MC's pages look: full width and text size, the page title on top,
// bigger arrows, text buttons for MC's picture buttons, the emphasized Version History box (lib/restyle.ts).

import { applyRestyle, clearRestyle, emphasizeVersionHistory, enlargeNavArrows, enlargePagerArrows, hidePageHeader } from '../restyle';
import { textButtons } from '../textbuttons';
import { currentPage } from '../mcpage';
import { textOf } from '../text';
import { tightMode } from '../tight';
import { applyWos } from '../wos';
import type { Feature } from './feature';

export function pageLook(): Feature {
  let pagerLogged = '';
  let tightLogged = '';
  let messageLogged = '';
  return {
    id: 'look',
    onPage({ doc, settings, send }) {
      applyRestyle(doc, settings);
      hidePageHeader(doc, settings.hidePageHeader);
      const tight = tightMode(doc, settings.tightMode);
      const tightKey = `${doc.location?.href}|${settings.tightMode}|${tight.logo}|${tight.instructions}`;
      if (settings.tightMode && tightKey !== tightLogged) {
        tightLogged = tightKey;
        send({ type: 'log', level: 'debug', event: 'tight mode', data: tight });
      }
      // What MC says on a popup it shows again after a press (Create
      // Account On The Fly redraws itself when it refuses): only how much
      // text is there and whether it is hidden, never the words.
      const page = currentPage(doc) ?? '';
      if (/POPUP/.test(page)) {
        const msg = popupMessage(doc);
        const msgKey = `${doc.location?.href}|${page}|${JSON.stringify(msg)}`;
        if ((msg.instructionsChars || msg.errorChars) && msgKey !== messageLogged) {
          messageLogged = msgKey;
          send({ type: 'log', level: 'info', event: 'popup message', data: { page, ...msg } });
        }
      }
      textButtons(doc, settings.textButtons, settings.fontSize);
      enlargeNavArrows(doc, true);
      const pager = enlargePagerArrows(doc, true);
      const key = `${doc.location?.href}|${pager.holders}|${pager.arrows}`;
      if ((pager.holders || pager.arrows) && key !== pagerLogged) {
        pagerLogged = key;
        send({ type: 'log', level: pager.arrows ? 'debug' : 'warn', event: 'pager arrows', data: pager });
      }
      emphasizeVersionHistory(doc, true, settings.fontSize, settings.idPattern);
      const wos = applyWos(doc, settings.webOfScience);
      if (wos.pressed) send({ type: 'log', level: 'info', event: 'web of science', data: { mode: settings.webOfScience } });
    },
    off(doc) {
      clearRestyle(doc);
      hidePageHeader(doc, false);
      tightMode(doc, false);
      textButtons(doc, false);
      applyWos(doc, null);
      enlargeNavArrows(doc, false);
      enlargePagerArrows(doc, false);
      emphasizeVersionHistory(doc, false);
    },
  };
}

/** How much text MC shows in a popup's instructions and error areas, and whether E-MC hides any of it. */
export function popupMessage(doc: Document): { instructionsChars: number; errorChars: number; errorShown: boolean; hidden: boolean } {
  const instr = Array.from(doc.querySelectorAll<HTMLElement>('td.instructions'));
  const err = doc.getElementById('MAIN_ERROR_DISPLAY_DIV');
  const view = doc.defaultView;
  const shown = (el: Element) => !view || view.getComputedStyle(el).display !== 'none';
  const hiddenByUs = (el: Element) => !!el.closest('[data-emc-hide], [data-emc-tight]') && !shown(el);
  const instructionsChars = instr.reduce((n, td) => n + textOf(td).length, 0);
  const errorChars = err ? textOf(err).length : 0;
  return {
    instructionsChars,
    errorChars,
    errorShown: !!err && shown(err),
    hidden: instr.some((td) => textOf(td).length > 0 && hiddenByUs(td)) || (!!err && errorChars > 0 && hiddenByUs(err)),
  };
}
