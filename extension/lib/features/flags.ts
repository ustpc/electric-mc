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
        // The panel lists every flag: send all of them when they differ from what's kept.
        const found = readFlagPanel(panel);
        if (Object.keys(found).length && JSON.stringify(found) !== JSON.stringify(here(doc))) {
          send({ type: 'flags', journal: journalKey(doc.location?.href ?? ''), map: found });
          send({ type: 'log', level: 'info', event: 'flags learned', data: { count: Object.keys(found).length } });
        }
      }
      draw(ctx);
    },
    off(doc) {
      labelFlags(doc, {}, false);
    },
  };
}
