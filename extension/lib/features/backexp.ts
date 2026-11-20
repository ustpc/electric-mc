// The Back-link experiment (lib/backexp.ts): test builds, developer mode,
// and only while its setting is on. A page shown by Back gets a bar at the
// top; a press on one of its links is noted (and, if asked, sent with the
// latest live page's hidden fields), and the next live page logs what MC
// answered. Nothing happens without the person's own press.

import { differing, hiddenFields, keepsOwnValue, linkKind, looksLikeError, mcControl, nextTrialNumber, readLatest, readVariant, swapInLatest, takeTrial, writeLatest, writeTrial, writeVariant, type Variant } from '../backexp';
import { parseManuscriptId } from '../ids';
import { currentPage } from '../mcpage';
import { EMC_COLOR } from '../ui';
import type { Feature, PageContext } from './feature';

const BAR = 'backexp';

function navType(doc: Document): string {
  const nav = doc.defaultView?.performance?.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav?.type ?? 'navigate';
}

export function backLinkExperiment(): Feature {
  // Whether this document is a page Back brought up again (from Chrome's
  // cache or its back/forward cache), rather than one MC just sent.
  let isBack = false;
  let logged = '';

  const on = (ctx: PageContext | null): ctx is PageContext => !!ctx && ctx.settings.developer && !!ctx.settings.backLinkExperiment;

  const showBar = (ctx: PageContext) => {
    const { doc } = ctx;
    const latest = readLatest(doc);
    const diff = latest ? differing(hiddenFields(doc), latest.fields).filter((k) => !keepsOwnValue(k)).length : 0;
    let bar = doc.querySelector<HTMLElement>(`[data-electric-mc="${BAR}"]`);
    if (!bar) {
      bar = doc.createElement('div');
      bar.setAttribute('data-electric-mc', BAR);
      bar.style.cssText = `position:sticky;top:0;z-index:2147483646;padding:6px 12px;background:#fff7ed;border-bottom:2px solid ${EMC_COLOR};color:${EMC_COLOR};font:bold 13px system-ui,sans-serif`;
      doc.body.prepend(bar);
    }
    const v = readVariant(doc);
    bar.innerHTML = '';
    bar.append(`E-MC experiment: Back showed this saved page (${diff} of its tokens differ from the latest page's). Its links go out: `);
    const choice = (value: Variant, label: string) => {
      const l = doc.createElement('label');
      l.style.cssText = 'margin-left:10px;cursor:pointer';
      const r = doc.createElement('input');
      r.type = 'radio';
      r.name = 'emc-backexp';
      r.checked = v === value;
      r.addEventListener('change', () => writeVariant(doc, value));
      l.append(r, ` ${label}`);
      bar!.append(l);
    };
    choice('as-saved', 'as saved');
    choice('latest', "with the latest page's tokens");
  };

  return {
    id: 'backexp',
    start({ doc, clicks, current }) {
      clicks.add('record', (e) => {
        const ctx = current();
        if (!on(ctx) || !isBack) return;
        const el = mcControl(e.target);
        if (!el) return;
        const latest = readLatest(doc);
        const variant = readVariant(doc);
        const saved = hiddenFields(doc);
        const swapped = variant === 'latest' && latest ? swapInLatest(doc, latest.fields) : [];
        const n = nextTrialNumber(doc);
        const kind = linkKind(el, (s) => !!parseManuscriptId(s, ctx.settings.idPattern));
        const from = currentPage(doc);
        writeTrial(doc, { n, variant, from, kind, swapped, at: Date.now() });
        ctx.send({
          type: 'log',
          level: 'info',
          event: 'back-exp press',
          data: { n, variant, from, kind, latestPage: latest?.page ?? null, differing: latest ? differing(saved, latest.fields) : null, swapped },
        });
      });
    },
    onPage(ctx) {
      if (!on(ctx)) return;
      const { doc, reason, result, send } = ctx;
      const nav = reason === 'bfcache' ? 'bfcache' : navType(doc);
      if (reason === 'bfcache' || (reason === 'load' && nav === 'back_forward')) isBack = true;
      const page = currentPage(doc);
      if (reason === 'load' || reason === 'bfcache') {
        const key = `${reason}|${nav}|${page}`;
        if (key !== logged) {
          logged = key;
          send({ type: 'log', level: 'info', event: 'back-exp page', data: { page, nav, shownByBack: isBack } });
        }
      }
      if (isBack) {
        showBar(ctx);
        return;
      }
      if (reason !== 'load') return;
      // A live page MC just sent: the answer to the last press, if any, and
      // the hidden fields the next press on a Back page may borrow.
      const trial = takeTrial(doc);
      if (trial) {
        send({
          type: 'log',
          level: 'info',
          event: 'back-exp result',
          data: {
            n: trial.n,
            variant: trial.variant,
            from: trial.from,
            kind: trial.kind,
            swapped: trial.swapped,
            page,
            pageType: result.pageType,
            loggedOut: result.pageType === 'login',
            error: looksLikeError(doc),
            popup: !!doc.defaultView?.opener,
            ms: Date.now() - trial.at,
          },
        });
      }
      if (page && !doc.defaultView?.opener) writeLatest(doc, { page, fields: hiddenFields(doc) });
    },
    off(doc) {
      doc.querySelector(`[data-electric-mc="${BAR}"]`)?.remove();
    },
  };
}
