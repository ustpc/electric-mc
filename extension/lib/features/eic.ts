// The To EIC list (lib/recommend.ts): recommendations and decisions the
// person sent, from the Submit or Commit Decision press and from the
// Recommendations box on the details page, and the marks on queue rows.

import { openedTask, isRecommendationSubmit, recommendationSubmitControl } from '../advance';
import { KEY } from '../messages';
import { annotateEicRows, isDecisionPress, myRecommendation, pickedChoice, readRecommendations, recommendationsBox, type EicItem } from '../recommend';
import { recommendsRole } from '../recommendform';
import { tabSet, tabTake } from '../tabstate';
import { rolesIn as editorBlock } from '../../parsers/dom';
import type { Feature, PageContext } from './feature';

const SUBMIT_MS = 3 * 60_000;

/**
 * The role a press is made in and whether the paper had an AE: the AE's
 * "… Recommends" form is the AE's; the co-chair's form, or an immediate
 * decision, is the co-chair's.
 */
export function pressRole(doc: Document): Pick<EicItem, 'role' | 'noAe'> {
  const ae = editorBlock(doc.body).get('ae');
  const noAe = !ae || /^not assigned$/i.test(ae.trim());
  return { role: recommendsRole(doc) === 'other' ? 'ae' : 'cc', noAe };
}

/** Today as yyyy-mm-dd, local time. */
export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function eicList(): Feature {
  let items: Record<string, EicItem> = {};

  // A press noted at Submit is kept once MC answers with a new page, so a
  // press MC refuses (or a guard stops) isn't kept. MC's Recommendations box
  // never shows an immediate decision made without an AE.
  const commitSubmitted = ({ doc, send }: PageContext) => {
    const pending = tabTake<EicItem & { at: number }>(doc.defaultView!, 'submittedChoice');
    if (!pending || Date.now() - pending.at > SUBMIT_MS) return;
    const { at: _at, ...item } = pending;
    send({ type: 'eic', set: item });
    send({ type: 'log', level: 'info', event: 'decision recorded at submit', data: { kind: item.kind, choice: item.recommendation } });
  };

  // The person's own recommendation in the Recommendations box. It leaves
  // the list when it's gone from the box (rescinded or acted on) or a
  // decision letter has gone out.
  const fromBox = ({ doc, result: r, send, letters }: PageContext) => {
    const m = r.manuscript;
    if (!m) return;
    const box = recommendationsBox(doc);
    const mine = box && myRecommendation(readRecommendations(box), editorBlock(doc.body).get('cc'));
    const had = items[m.id];
    if (mine) {
      const item: EicItem = { id: m.id, baseId: m.baseId, site: r.site, title: m.title, recommendation: mine.recommendation, seen: today(), kind: had?.kind ?? 'recommendation', source: 'box', ...(had?.role ? { role: had.role } : {}), ...(had?.noAe !== undefined ? { noAe: had.noAe } : {}) };
      if (!had || had.recommendation !== item.recommendation || had.title !== item.title || had.source !== 'box') {
        send({ type: 'eic', set: item });
        send({ type: 'log', level: 'info', event: 'recommendation to EIC recorded', data: { recommendation: mine.recommendation } });
      }
    } else if (had && ((box && had.source !== 'submit') || letters().has(m.id))) {
      send({ type: 'eic', remove: m.id });
      send({ type: 'log', level: 'info', event: 'recommendation to EIC cleared', data: { reason: box ? 'no longer in Recommendations' : 'decision sent' } });
    }
  };

  const mark = ({ doc, result, settings }: PageContext) => {
    if (result.pageType === 'queue-list') annotateEicRows(doc, items, settings.idPattern);
  };

  return {
    id: 'eic',
    watches: [KEY.eic],
    start({ doc, clicks, current }) {
      // Note the choice in each press that gets past the guards (record phase).
      clicks.add('record', (e) => {
        const ctx = current();
        if (!ctx || !isRecommendationSubmit(e.target)) return;
        const m = ctx.result.manuscript;
        const control = recommendationSubmitControl(e.target);
        const choice = pickedChoice(doc);
        if (!m || !control || !choice) return;
        const item: EicItem = {
          id: m.id,
          baseId: m.baseId,
          site: ctx.result.site ?? null,
          title: m.title,
          recommendation: choice,
          seen: today(),
          kind: isDecisionPress(control, openedTask(doc, m.id)) ? 'decision' : 'recommendation',
          source: 'submit',
          ...pressRole(doc),
        };
        tabSet(doc.defaultView!, 'submittedChoice', { ...item, at: Date.now() });
      });
    },
    onStored(_key, value, ctx) {
      items = (value as Record<string, EicItem> | undefined) ?? {};
      if (ctx) mark(ctx);
    },
    onPage(ctx) {
      commitSubmitted(ctx);
      fromBox(ctx);
      mark(ctx);
    },
    off(doc) {
      doc.querySelectorAll('[data-electric-mc="eic-note"]').forEach((e) => e.remove());
    },
  };
}
