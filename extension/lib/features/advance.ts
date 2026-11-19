// Auto-advance (lib/advance.ts): after a recommendation goes through, open
// the next manuscript in the list, and open the same task on it.

import { carryTask, onPageLoad } from '../advance';
import { toast } from '../ui';
import type { Feature } from './feature';

export function autoAdvance(): Feature {
  return {
    id: 'advance',
    onPage({ doc, result, reason, settings, send }) {
      if (reason === 'load' || reason === 'bfcache') {
        const adv = onPageLoad(doc, result.manuscript?.id, settings.autoAdvance, settings.idPattern);
        if (adv) {
          send({ type: 'log', level: 'info', event: 'auto-advance after recommendation', data: adv });
          if (adv.how === 'end') toast(doc, 'E-MC: that was the last manuscript in this direction');
        }
      }
      if (settings.autoAdvance) {
        const carried = carryTask(doc, result.manuscript?.id);
        if (carried) send({ type: 'log', level: 'info', event: 'same task on the next manuscript', data: carried });
      }
    },
  };
}
