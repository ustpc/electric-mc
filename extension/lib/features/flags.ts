// MC's flag icons (lib/flags.ts): learn each icon's label from the Flag
// This Manuscript panel, and write the label beside the icon elsewhere.

import { journalKey } from '../aeload';
import { flagPanel, labelFlags, readFlagPanel, type FlagMap } from '../flags';
import { KEY } from '../messages';
import type { Feature, PageContext } from './feature';

export function flagLabels(): Feature {
  let maps: Record<string, FlagMap> = {};
  const here = (doc: Document) => maps[journalKey(doc.location?.href ?? '')] ?? {};
  const draw = ({ doc, settings }: PageContext) => labelFlags(doc, here(doc), settings.flagLabels);
  return {
    id: 'flags',
    watches: [KEY.flags],
    onStored(_key, value, ctx) {
      maps = (value as Record<string, FlagMap> | undefined) ?? {};
      if (ctx) draw(ctx);
    },
    onPage(ctx) {
      const { doc, send } = ctx;
      const panel = flagPanel(doc);
      if (panel) {
        const known = here(doc);
        const fresh = Object.fromEntries(Object.entries(readFlagPanel(panel)).filter(([k, v]) => known[k] !== v));
        if (Object.keys(fresh).length) {
          send({ type: 'flags', journal: journalKey(doc.location?.href ?? ''), map: fresh });
          send({ type: 'log', level: 'info', event: 'flags learned', data: { count: Object.keys(fresh).length } });
        }
      }
      draw(ctx);
    },
    off(doc) {
      labelFlags(doc, {}, false);
    },
  };
}
