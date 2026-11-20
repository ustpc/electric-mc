// How MC's pages look: full width and text size, the page title on top,
// bigger arrows, the emphasized Version History box (lib/restyle.ts).

import { applyRestyle, clearRestyle, emphasizeVersionHistory, enlargeNavArrows, enlargePagerArrows, hidePageHeader } from '../restyle';
import { tightMode } from '../tight';
import { applyWos } from '../wos';
import type { Feature } from './feature';

export function pageLook(): Feature {
  let pagerLogged = '';
  let tightLogged = '';
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
      applyWos(doc, null);
      enlargeNavArrows(doc, false);
      enlargePagerArrows(doc, false);
      emphasizeVersionHistory(doc, false);
    },
  };
}
