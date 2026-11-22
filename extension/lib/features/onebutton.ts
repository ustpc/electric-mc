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
import { findAeSelect } from '../aeload';
import { rolesIn as editorBlock } from '../../parsers/dom';
import type { Feature, PageContext } from './feature';

const removeControls = (doc: Document) => doc.querySelector('[data-electric-mc="one-button"]')?.remove();

export function oneButtonReject(): Feature {
  let latest: () => PageContext | null = () => null;
  const hooks = (ctx: PageContext): Hooks => ({
    openBySearch: (id: string) => openManuscript(ctx.doc, id),
    log: (event: string, data?: unknown) => ctx.send({ type: 'log', level: 'info', event, data }),
  });

  // Why the controls aren't on this page, said once per page and reason (in
  // the console and the log), so a missing button can be explained.
  let said = '';
  const skip = (ctx: PageContext, why: string) => {
    const key = `${ctx.doc.location?.href}|${why}`;
    if (key === said) return;
    said = key;
    console.info('[electric-mc] one-button reject not shown:', why);
    ctx.send({ type: 'log', level: 'info', event: 'one-button not shown', data: why });
  };

  const add = (ctx: PageContext) => {
    const { doc } = ctx;
    const id = ctx.result.manuscript?.id;
    if (!id) return skip(ctx, 'no manuscript ID on the page');
    if (readRun(doc)) return skip(ctx, 'a run is in progress in this tab');
    const shown = addControls(doc, pdfViewed(doc, id), () => void (async () => {
      // The setting (or E-MC on this site) may have been turned off since the controls went up.
      if (!latest()?.settings.oneButtonReject) {
        removeControls(doc);
        return;
      }
      const blocked = blockedBy(await ctx.get<ProbeStore>(KEY.probes), currentPage(doc), 'oneButtonReject');
      if (blocked.length) {
        showBanner(doc, `One-button reject didn't start: MC seems to have changed this page (${blocked.join(', ')} not found lately). Do it by hand.`, 'stop');
        return;
      }
      const why = startRun(doc, id, readIdentity(doc));
      if (why) showBanner(doc, `One-button reject didn't start: ${why}`, 'stop');
      else hooks(ctx).log('one-button reject started', {});
    })());
    if (!shown) skip(ctx, findAeSelect(doc) ? 'no Assign control next to the AE pull-down' : 'no AE pull-down on the page');
  };

  return {
    id: 'one-button',
    start({ doc, clicks, current }) {
      latest = current;
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
      if (!settings.oneButtonReject) removeControls(doc);
      if (reason !== 'load') {
        if (settings.oneButtonReject && r.pageType === 'manuscript') add(ctx);
        return;
      }
      const id = r.pageType === 'manuscript' ? r.manuscript?.id : undefined;
      if (!readRun(doc)) forgetPdfUnless(doc, id);
      // A popup MC opens (an e-mail window) inherits this tab's sessionStorage; leave it alone.
      if (!settings.oneButtonReject) return;
      if (doc.defaultView?.opener) return skip(ctx, 'this window was opened by another (a popup)');
      const step = () => stepRun(doc, { manuscript: id, isDetails: r.pageType === 'manuscript' }, editorBlock(doc.body).get('ae'), hooks(ctx));
      // On a slow connection E-MC can start before MC's page has finished
      // loading, and MC ignores its own links until then
      // (isPageCompletelyLoaded): take the run's next step once it has.
      if (doc.readyState === 'complete' || !doc.defaultView) step();
      else {
        ctx.send({ type: 'log', level: 'info', event: 'one-button reject waits for the page', data: { readyState: doc.readyState } });
        // Checked again when it fires: the setting (or E-MC on this site) may be off by then.
        doc.defaultView.addEventListener('load', () => {
          if (latest()?.settings.oneButtonReject) step();
        }, { once: true });
      }
      if (r.pageType === 'manuscript') add(ctx);
    },
    off(doc) {
      removeControls(doc);
    },
  };
}
