// Queue lists: revisions highlighted (lib/highlight.ts) and IDs that open
// the manuscript (lib/idlink.ts).

import { clearHighlights, highlightRevisions } from '../highlight';
import { linkIds, unlinkIds } from '../idlink';
import type { Feature } from './feature';

export function queueMarks(): Feature {
  return {
    id: 'queue-marks',
    onPage({ doc, result, settings }) {
      if (settings.highlightRevisions && result.pageType === 'queue-list') highlightRevisions(doc, settings.idPattern);
      else clearHighlights(doc);
      if (result.pageType === 'queue-list') linkIds(doc, settings.idPattern);
    },
    off(doc) {
      clearHighlights(doc);
      unlinkIds(doc);
    },
  };
}
