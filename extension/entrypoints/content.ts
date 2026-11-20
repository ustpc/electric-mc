// Content script for every Manuscript Central page. It parses the page,
// rewrites the title, helps password managers on the login page, reports to
// the background, and (optionally) shows a small debug badge. It re-parses
// when MC changes the page in place. Nothing runs on sites switched off.

import { defineContentScript } from 'wxt/utils/define-content-script';
import { openManuscript, singleResultAction, takePending } from '../lib/search';
import { annotateLogin, findLoginFields, pictureAccountLinks, watchForAutofill } from '../lib/login';
import { coChairLanding, watchLoginSubmit } from '../lib/landing';
import { decisionLettersIn } from '../lib/milestones';
import { toast } from '../lib/ui';
import { KEY, SETTINGS_AREA, getSettings, isEnabledFor, type CaptureReply, type Msg, type Settings } from '../lib/messages';
import { TitleKeeper, titleFor } from '../lib/title';
import { parsePage } from '../parsers';
import type { ParseResult } from '../parsers/types';
import { pageClick } from '../lib/click';
import { watchFileAttach } from '../lib/attach';
import { watchRadioRows } from '../lib/radiorow';
import { findSearchToggle, keepaliveDue, sendKeepalive } from '../lib/keepalive';
import { watchRecommendations } from '../lib/advance';
import { watchMissingChoice } from '../lib/needchoice';
import { watchAuthorComments } from '../lib/authorcomment';
import { describePage, watchClicks, watchRequests } from '../lib/devtrace';
import { abstractAndKeywords } from '../parsers/extract';
import { showPdfWordCount } from '../lib/pdfcount';
import { currentPage } from '../lib/mcpage';
import { clickBus } from '../lib/clickbus';
import { deliverStored, featuresOff, runFeatures, startFeatures, watchedKeys, type Feature, type PageContext } from '../lib/features/feature';
import { versionHistory } from '../lib/features/versions';
import { aeAssignMenu } from '../lib/features/aemenu';
import { oneButtonReject } from '../lib/features/onebutton';
import { eicList } from '../lib/features/eic';
import { flagLabels } from '../lib/features/flags';
import { pageLook } from '../lib/features/look';
import { autoAdvance } from '../lib/features/advance';
import { queueMarks } from '../lib/features/queuemarks';
import { recordIdentity, recordRoles } from '../lib/features/recorders';
import { runProbes } from '../lib/probes';
import { sampleDue, snapshotHtml } from '../lib/pagesample';

export default defineContentScript({
  matches: ['https://*.manuscriptcentral.com/*'],
  runAt: 'document_idle',
  // Top frame only for now; frames would overwrite each other's tab state.
  allFrames: false,
  main() {
    void start();
  },
});

const MARK = 'data-electric-mc';

async function start() {
  // A PDF from MC opens in Chrome's viewer; the background sets its zoom.
  // It also gets a word count (lib/pdfcount.ts).
  if (document.contentType === 'application/pdf') {
    chrome.runtime.sendMessage({ type: 'pdf-opened' } satisfies Msg).catch(() => {});
    const s = await getSettings();
    if (s.pdfWordCount && isEnabledFor(s, location.href)) {
      showPdfWordCount().then(
        (data) => send({ type: 'log', level: 'info', event: 'PDF words', data }),
        (e: unknown) => send({ type: 'log', level: 'warn', event: 'PDF words', data: { error: String(e) } }),
      );
    }
    return;
  }
  let settings: Settings = await getSettings();
  const titles = new TitleKeeper(document, (from, to) => send({ type: 'log', level: 'debug', event: 'title reapplied', data: { from, to } }));
  let last: ParseResult | null = null;
  let overlay: Overlay | null = null;
  let stopLogin: (() => void) | null = null;
  let observer: MutationObserver | null = null;
  let timer: number | undefined;

  const enabled = () => isEnabledFor(settings, location.href);
  // Every click handler of ours, in phases (lib/clickbus.ts): trace, guard, record, act.
  const clicks = clickBus(document);
  // Features as modules (lib/features/): those that record what the page
  // says run early in each run, the queue marks where they always did, and
  // those that change how the page looks last.
  const recorders: Feature[] = [versionHistory(), aeAssignMenu(), recordRoles(), recordIdentity()];
  const actions: Feature[] = [oneButtonReject()];
  const navigation: Feature[] = [autoAdvance()];
  const queue: Feature[] = [queueMarks(), eicList()];
  const look: Feature[] = [flagLabels(), pageLook()];
  const features = [...recorders, ...actions, ...navigation, ...queue, ...look];
  // The latest run's context, for click handlers and stored-value changes.
  let current: PageContext | null = null;
  const live = () => (chrome.runtime?.id && enabled() ? current : null);
  const getStored = async <T,>(key: string) => (await chrome.storage.local.get(key))[key] as T | undefined;
  startFeatures(features, { doc: document, clicks, current: live }, send);
  const watched = watchedKeys(features);
  deliverStored(features, await chrome.storage.local.get(watched), null, send);
  const run = (reason: string) => {
    // After the extension is reloaded, this copy keeps running in open tabs
    // until they are reloaded. Stop it so it can't fight the new version.
    if (!chrome.runtime?.id) {
      observer?.disconnect();
      titles.restore();
      return;
    }
    if (!enabled()) return;
    let r: ParseResult;
    try {
      r = parsePage(document, location.href, { idPattern: settings.idPattern });
    } catch (e) {
      send({ type: 'log', level: 'error', event: 'parse threw', data: String(e) });
      return;
    }
    const changed = !last || last.fingerprint !== r.fingerprint || last.pageType !== r.pageType || idsKey(last) !== idsKey(r);
    last = r;
    // The page's decision letters (Audit Trail), read at most once per run: several features use them.
    let letters: Map<string, string> | undefined;
    const ctx: PageContext = { doc: document, result: r, reason, settings, send, letters: () => (letters ??= decisionLettersIn(document, settings.idPattern)), get: getStored };
    current = ctx;
    const title = settings.rewriteTitle ? titleFor(r) : null;
    if (settings.rewriteTitle) titles.set(title);
    if (changed || reason !== 'mutation') send({ type: 'parsed', result: r, reason, title });
    if (settings.developer) (overlay ??= new Overlay()).show(r, title);
    else overlay?.hide();
    // Any page with one password field gets login help, whatever the classifier
    // thought (a maintenance notice can make the login page look like something else).
    if (!stopLogin && (r.pageType === 'login' || document.querySelectorAll('input[type=password]').length === 1)) setUpLogin();
    runFeatures(recorders, ctx);
    if (reason === 'load') followSearch(r);
    runFeatures(actions, ctx);
    if (reason === 'load') landAfterLogin();
    if (settings.developer && (reason === 'load' || reason === 'bfcache')) send({ type: 'log', level: 'debug', event: 'page', data: describePage(document) });
    if (settings.developer && reason === 'load') void samplePage();
    if (reason === 'load') sendProbes();
    runFeatures(navigation, ctx);
    runFeatures(queue, ctx);
    runFeatures(look, ctx);
    console.debug('[electric-mc]', reason, r.pageType, r.confidence, r);
  };

  // After a search: press Take Action when it found exactly one manuscript,
  // either because the side panel asked for that ID or because the person
  // turned it on for every search. Never when they came Back to the results.
  const followSearch = (r: ParseResult) => {
    const pending = takePending(document);
    const crumb = r.breadcrumb[r.breadcrumb.length - 1] ?? '';
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'back_forward') return;
    if (!pending && !(settings.autoTakeAction && /search results/i.test(crumb))) return;
    const hit = singleResultAction(document, settings.idPattern);
    if (!hit || (pending && hit.id !== pending)) {
      if (pending) send({ type: 'log', level: 'warn', event: 'search did not find exactly that manuscript', data: pending });
      return;
    }
    send({ type: 'log', level: 'info', event: 'take action after search', data: hit.id });
    pageClick(hit.action);
  };

  const setUpLogin = () => {
    const f = findLoginFields(document);
    if (!f) {
      send({ type: 'log', level: 'warn', event: 'login fields not found' });
      return;
    }
    annotateLogin(f);
    const pictured = pictureAccountLinks(document);
    send({ type: 'log', level: 'info', event: 'login form annotated for password managers', data: { submit: !!f.submit, pageType: last?.pageType, pictured } });
    const stopSubmit = watchLoginSubmit(f.password, f.submit);
    const stopAutofill = settings.autoLogin
      ? watchForAutofill(f, (how) => send({ type: 'log', level: 'info', event: 'auto-submitted login', data: how }))
      : () => {};
    stopLogin = () => {
      stopSubmit();
      stopAutofill();
    };
  };

  // The first page after a login goes on to the Co-Chair Center (lib/landing.ts).
  const landAfterLogin = () => {
    const link = coChairLanding(document);
    if (!link || !settings.loginToCoChair) return;
    send({ type: 'log', level: 'info', event: 'to the Co-Chair Center after login' });
    pageClick(link);
  };

  const turnOn = () => {
    // MC sometimes swaps content without a navigation (tabs, expanders, AJAX
    // panels). Re-parse after the page settles.
    observer ??= new MutationObserver((records) => {
      // Ignore changes we made ourselves (badge, notes in the page, hidden frames).
      const ours = (n: Node) => n.nodeType === 1 && !!(n as Element).closest?.(`[${MARK}]`);
      if (records.every((m) => ours(m.target) || ([...m.addedNodes, ...m.removedNodes].length > 0 && [...m.addedNodes, ...m.removedNodes].every(ours))))
        return;
      clearTimeout(timer);
      timer = window.setTimeout(() => run('mutation'), 500);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    run('load');
  };

  const turnOff = () => {
    observer?.disconnect();
    clearTimeout(timer);
    titles.restore();
    featuresOff(features, document);
    overlay?.hide();
    stopLogin?.();
    stopLogin = null;
    last = null;
    current = null;
    send({ type: 'disabled' });
  };

  if (enabled()) turnOn();
  else send({ type: 'disabled' });

  // Press Attach once a file is chosen. File names are never logged.
  watchFileAttach(
    document,
    () => !!chrome.runtime?.id && enabled() && settings.autoAttach,
    (found) => send({ type: 'log', level: 'info', event: 'auto attach', data: { found } }),
  );

  // Developer trace: every click, for replaying a session from the log.
  watchClicks(document, () => !!chrome.runtime?.id && enabled() && settings.developer, (c) => send({ type: 'log', level: 'debug', event: 'click', data: c }), clicks);
  watchRequests(window, () => !!chrome.runtime?.id && enabled() && settings.developer, (r) => send({ type: 'log', level: 'debug', event: 'request', data: r }));

  // Stop a recommendation or decision that has no choice picked
  // (lib/needchoice.ts). A guard: a stopped press reaches nothing else.
  watchMissingChoice(document, () => !!chrome.runtime?.id && enabled(), (data) =>
    send({ type: 'log', level: 'info', event: 'no recommendation picked', data }),
  clicks);

  // Ask before a decision or recommendation goes out with no comment to the
  // author (lib/authorcomment.ts). A guard too, so a cancelled press doesn't count
  // as a recommendation for auto-advance.
  watchAuthorComments(document, () => !!chrome.runtime?.id && enabled(), (m) => window.confirm(m), (data) =>
    send({ type: 'log', level: 'info', event: 'no comment to author', data }),
  clicks);

  // After a recommendation, go on to the next manuscript (lib/advance.ts).
  watchRecommendations(document, () => last?.manuscript?.id, () => !!chrome.runtime?.id && enabled() && settings.autoAdvance, clicks);

  // Clicking anywhere in a radio-button row picks its radio button.
  watchRadioRows(document, () => !!chrome.runtime?.id && enabled(), (data) => send({ type: 'log', level: data.picked ? 'debug' : 'warn', event: 'radio row', data }), clicks);

  // Keepalives (lib/keepalive.ts). Activity is shared through storage, at
  // most once a minute; our own clicks fire no mousedown, so they don't count.
  let activityWritten = 0;
  const onActivity = () => {
    if (!chrome.runtime?.id || Date.now() - activityWritten < 60_000) return;
    activityWritten = Date.now();
    void chrome.storage.local.set({ [KEY.lastActivity]: activityWritten }).catch(() => {});
  };
  for (const t of ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']) window.addEventListener(t, onActivity, { passive: true, capture: true });
  onActivity();
  const keepalive = async (trigger: 'idle' | 'hotkey') => {
    await chrome.storage.local.set({ [KEY.lastKeepalive]: Date.now() });
    const r = await sendKeepalive(document);
    const got = await chrome.storage.local.get(KEY.lastActivity).catch(() => ({}) as Record<string, unknown>);
    const activity = got[KEY.lastActivity] as number | undefined;
    // Minutes since the person last used MC and since this page loaded, to
    // compare with when MC logs them out.
    const idleMin = activity ? Math.round((Date.now() - activity) / 60_000) : undefined;
    const pageMin = Math.round(performance.now() / 60_000);
    send({ type: 'log', level: r.found ? 'info' : 'warn', event: 'keepalive', data: { trigger, ...r, idleMin, pageMin } });
    if (trigger === 'hotkey') toast(document, r.found ? `E-MC keepalive sent: ${r.requests} request${r.requests === 1 ? '' : 's'} to MC` : 'E-MC keepalive: no "+ Search" on this page');
  };
  window.setInterval(() => {
    if (!chrome.runtime?.id || !enabled() || !settings.keepAlive) return;
    void chrome.storage.local.get([KEY.lastActivity, KEY.lastKeepalive]).then((got) => {
      const activity = (got[KEY.lastActivity] as number | undefined) ?? Date.now();
      const sent = (got[KEY.lastKeepalive] as number | undefined) ?? 0;
      // Only a tab whose page has the "+ Search" toggle sends; the others
      // leave the turn to it rather than claiming it and sending nothing.
      if (keepaliveDue(Date.now(), activity, sent) && findSearchToggle(document)) void keepalive('idle');
    });
  }, 60_000);
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey || e.key.toLowerCase() !== 'k' || !enabled()) return;
    e.preventDefault();
    void keepalive('hotkey');
  });

  // Back/forward cache restores don't re-run content scripts.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) run('bfcache');
  });

  chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
    if (msg.type === 'open') {
      reply({ ok: openManuscript(document, msg.id) });
    } else if (msg.type === 'ping') {
      reply({ version: chrome.runtime.getManifest().version });
    } else if (msg.type === 'reparse') {
      run('manual');
      reply({ ok: enabled() });
    } else if (msg.type === 'capture') {
      const r = parsePage(document, location.href, { idPattern: settings.idPattern });
      const out: CaptureReply = { url: location.href, title: document.title, html: snapshot(), result: r };
      reply(out);
    } else if (msg.type === 'abstract') {
      reply(abstractAndKeywords(document));
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && watched.some((k) => changes[k])) {
      const values = Object.fromEntries(watched.filter((k) => changes[k]).map((k) => [k, changes[k]!.newValue]));
      deliverStored(features, values, live(), send);
      return;
    }
    if (area !== SETTINGS_AREA || !changes[KEY.settings]) return;
    void getSettings().then((s) => {
      const was = enabled();
      settings = s;
      if (was && !enabled()) return turnOff();
      if (!was && enabled()) return turnOn();
      if (!s.rewriteTitle) titles.restore();
      if (!s.autoLogin) {
        stopLogin?.();
        stopLogin = null;
      }
      run('settings');
    });
  });
}


function idsKey(r: ParseResult): string {
  return r.manuscriptIds.map((m) => m.id).join(',');
}

function send(m: Msg) {
  chrome.runtime.sendMessage(m).catch(() => {});
}

/** Each load: which of the page parts our features rely on are there (lib/probes.ts). Names and booleans only. */
function sendProbes(): void {
  const page = currentPage(document);
  if (page) send({ type: 'probes', page, results: runProbes(document) });
}

/**
 * Test builds in developer mode: once a week per kind of page (CURRENT_PAGE),
 * send this page's snapshot to be saved on this computer for the local
 * real-data tests (lib/pagesample.ts). The background checks again.
 */
async function samplePage(): Promise<void> {
  if (!chrome.runtime.getManifest().permissions?.includes('nativeMessaging')) return;
  const name = currentPage(document);
  if (!name) return;
  const last = (await chrome.storage.local.get(KEY.pageSamples))[KEY.pageSamples] as Record<string, number> | undefined;
  if (!sampleDue(last, name, Date.now())) return;
  send({ type: 'page-sample', name, url: location.origin + location.pathname, html: snapshot() });
}

/** Page HTML without our overlay, scripts, or anything typed into fields. */
function snapshot(): string {
  return snapshotHtml(document);
}

/**
 * Debug badge: a small pill in the corner that expands on click, in a shadow
 * root so MC's CSS can't touch it. Off by default; the side panel shows the
 * same information.
 */
class Overlay {
  private host: HTMLElement;
  private pill: HTMLElement;
  private pre: HTMLElement;
  private open = false;
  private dismissed = false;

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute(MARK, 'overlay');
    this.host.style.cssText = 'all:initial;position:fixed;left:8px;bottom:8px;z-index:2147483647';
    const root = this.host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .b{font:11px/1.3 system-ui,sans-serif;background:rgba(17,24,39,.85);color:#f9fafb;border-radius:999px;padding:3px 8px;
         cursor:pointer;display:inline-flex;gap:6px;align-items:center}
      .open .b{border-radius:8px}
      .x{opacity:.6} .x:hover{opacity:1}
      pre{display:none;white-space:pre-wrap;margin:4px 0 0;max-height:300px;max-width:380px;overflow:auto;font:11px ui-monospace,monospace;
          background:rgba(17,24,39,.95);color:#f9fafb;padding:6px;border-radius:8px}
      .open pre{display:block}
    </style><div class="w"><span class="b"><span class="t"></span><span class="x" title="Hide on this page">×</span></span><pre></pre></div>`;
    const wrap = root.querySelector('.w') as HTMLElement;
    this.pill = root.querySelector('.t')!;
    this.pre = root.querySelector('pre')!;
    root.querySelector('.b')!.addEventListener('click', () => {
      this.open = !this.open;
      wrap.classList.toggle('open', this.open);
    });
    root.querySelector('.x')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismissed = true;
      this.hide();
    });
    document.documentElement.appendChild(this.host);
  }

  show(r: ParseResult, title: string | null) {
    if (this.dismissed) return;
    this.host.style.display = '';
    this.pill.textContent = `EMC ${r.pageType} ${Math.round(r.confidence * 100)}%${r.warnings.length ? ` ⚠${r.warnings.length}` : ''}`;
    this.pre.textContent = JSON.stringify(
      {
        title,
        ids: r.manuscriptIds.map((m) => m.id),
        alternatives: r.alternatives,
        signals: r.signals.map((s) => `${s.pageType}: ${s.name} +${s.weight}${s.detail ? ` (${s.detail})` : ''}`),
        strategies: r.strategies,
        warnings: r.warnings,
        fingerprint: r.fingerprint,
        ms: r.elapsedMs,
      },
      null,
      1,
    );
  }

  hide() {
    this.host.style.display = 'none';
  }
}
