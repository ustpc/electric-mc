// How MC's pages look: full width and text size, the page title on top,
// bigger arrows, the emphasized Version History box (lib/restyle.ts).

import { applyRestyle, clearRestyle, emphasizeVersionHistory, enlargeNavArrows, enlargePagerArrows, hidePageHeader } from '../restyle';
import type { Feature } from './feature';

export function pageLook(): Feature {
  let pagerLogged = '';
  return {
    id: 'look',
    onPage({ doc, settings, send }) {
      applyRestyle(doc, settings);
      hidePageHeader(doc, settings.hidePageHeader);
      enlargeNavArrows(doc, true);
      const pager = enlargePagerArrows(doc, true);
      const key = `${doc.location?.href}|${pager.holders}|${pager.arrows}`;
      if ((pager.holders || pager.arrows) && key !== pagerLogged) {
        pagerLogged = key;
        send({ type: 'log', level: pager.arrows ? 'debug' : 'warn', event: 'pager arrows', data: pager });
      }
      emphasizeVersionHistory(doc, true, settings.fontSize, settings.idPattern);
    },
    off(doc) {
      clearRestyle(doc);
      hidePageHeader(doc, false);
      enlargeNavArrows(doc, false);
      enlargePagerArrows(doc, false);
      emphasizeVersionHistory(doc, false);
    },
  };
}
