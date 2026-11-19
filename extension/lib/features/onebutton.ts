// One-button reject (lib/onebutton.ts): the controls next to Assign on a
// details page, and each step of a run as its pages load. It doesn't start
// where MC seems to have changed a page part the run needs (lib/probes.ts).

import { blockedBy, type ProbeStore } from '../probes';
import { isRecommendationSubmit } from '../advance';
import { readIdentity } from '../identity';
import { currentPage } from '../mcpage';
import { KEY } from '../messages';
import { addControls, forgetPdfUnless, isPdfLink, noteAeSubmit, notePdfViewed, pdfViewed, readRun, refreshControls, showBanner, startRun, stepRun, type Hooks } from '../onebutton';
import { openManuscript } from '../search';
import { rolesIn as editorBlock } from '../../parsers/dom';
import type { Feature, PageContext } from './feature';

export function oneButtonReject(): Feature {
  const hooks = (ctx: PageContext): Hooks => ({
    openBySearch: (id: string) => openManuscript(ctx.doc, id),
    log: (event: string, data?: unknown) => ctx.send({ type: 'log', level: 'info', event, data }),
  });

  const add = (ctx: PageContext) => {
    const { doc } = ctx;
    const id = ctx.result.manuscript?.id;
    if (!id || readRun(doc)) return;
    addControls(doc, pdfViewed(doc, id), () => void (async () => {
      const blocked = blockedBy(await ctx.get<ProbeStore>(KEY.probes), currentPage(doc), 'oneButtonReject');
      if (blocked.length) {
        showBanner(doc, `One-button reject didn't start: MC seems to have changed this page (${blocked.join(', ')} not found lately). Do it by hand.`, 'stop');
        return;
      }
      const why = startRun(doc, id, readIdentity(doc));
      if (why) showBanner(doc, `One-button reject didn't start: ${why}`, 'stop');
      else hooks(ctx).log('one-button reject started', {});
    })());
  };

  return {
    id: 'one-button',
    start({ doc, clicks, current }) {
      clicks.add('record', (e) => {
        const ctx = current();
        if (!ctx?.settings.oneButtonReject) return;
        // The AE's own recommendation, sent by hand during a run.
        if (isRecommendationSubmit(e.target)) noteAeSubmit(doc, hooks(ctx));
        const id = ctx.result.pageType === 'manuscript' ? ctx.result.manuscript?.id : undefined;
        if (id && isPdfLink(e.target)) {
          notePdfViewed(doc, id);
          refreshControls(doc, true);
        }
      });
    },
    onPage(ctx) {
      const { doc, result: r, settings, reason } = ctx;
      if (reason !== 'load') {
        if (settings.oneButtonReject && r.pageType === 'manuscript') add(ctx);
        return;
      }
      const id = r.pageType === 'manuscript' ? r.manuscript?.id : undefined;
      if (!readRun(doc)) forgetPdfUnless(doc, id);
      // A popup MC opens (an e-mail window) inherits this tab's sessionStorage; leave it alone.
      if (!settings.oneButtonReject || doc.defaultView?.opener) return;
      stepRun(doc, { manuscript: id, isDetails: r.pageType === 'manuscript' }, editorBlock(doc.body).get('ae'), hooks(ctx));
      if (r.pageType === 'manuscript') add(ctx);
    },
  };
}
