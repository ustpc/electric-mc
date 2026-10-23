// Content script for every Manuscript Central page. It parses the page,
// rewrites the title, helps password managers on the login page, reports to
// the background, and (optionally) shows a small debug badge. It re-parses
// when MC changes the page in place. Nothing runs on sites switched off.

import { defineContentScript } from 'wxt/utils/define-content-script';
import { clearHighlights, highlightRevisions } from '../lib/highlight';
import { applyRestyle, clearRestyle, hidePageHeader } from '../lib/restyle';
import { openManuscript, singleResultAction, takePending } from '../lib/search';
import { annotateLogin, findLoginFields, watchForAutofill } from '../lib/login';
import { addMilestoneRows, decisionLettersIn, versionInfoFrom, type VersionInfo } from '../lib/milestones';
import { annotateVersionRow, findVersionLinks } from '../lib/versions';
import { Unavailable, isOurFrame, lookupOffscreen } from '../lib/offscreen';
import { KEY, SETTINGS_AREA, getSettings, isEnabledFor, type CaptureReply, type Msg, type SeenManuscript, type Settings } from '../lib/messages';
import { TitleKeeper, titleFor } from '../lib/title';
import { parsePage } from '../parsers';
import type { ParseResult } from '../parsers/types';
import { pageClick } from '../lib/click';
import { watchFileAttach } from '../lib/attach';

export default defineContentScript({
  matches: ['https://*.manuscriptcentral.com/*'],
  runAt: 'document_idle',
  // Top frame only for now; frames would overwrite each other's tab state.
  allFrames: false,
  main() {
    // Nothing in our own lookup frames (only the page-click script runs there).
    if (isOurFrame(window)) return;
    void start();
  },
});

const MARK = 'data-electric-mc';

async function start() {
  let settings: Settings = await getSettings();
  const titles = new TitleKeeper(document, (from, to) => send({ type: 'log', level: 'debug', event: 'title reapplied', data: { from, to } }));
  let last: ParseResult | null = null;
  let overlay: Overlay | null = null;
  let stopLogin: (() => void) | null = null;
  let observer: MutationObserver | null = null;
  let timer: number | undefined;

  const enabled = () => isEnabledFor(settings, location.href);

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
    const title = settings.rewriteTitle ? titleFor(r) : null;
    if (settings.rewriteTitle) titles.set(title);
    if (changed || reason !== 'mutation') send({ type: 'parsed', result: r, reason, title });
    if (settings.developer) (overlay ??= new Overlay()).show(r, title);
    else overlay?.hide();
    // Any page with one password field gets login help, whatever the classifier
    // thought (a maintenance notice can make the login page look like something else).
    if (!stopLogin && (r.pageType === 'login' || document.querySelectorAll('input[type=password]').length === 1)) setUpLogin();
    recordLetters(r);
    recordThisVersion(r);
    if (reason === 'load') followSearch(r);
    if (r.manuscript && r.manuscript.revision > 0 && settings.lookupEarlierVersions) {
      void earlierVersions(r);
      // MC sometimes redraws the section; put our rows back.
      if (milestones?.on === r.manuscript.id && !document.querySelector('tr[data-electric-mc="milestones"]')) addMilestoneRows(document, milestones.info);
    } else {
      document.querySelectorAll('tr[data-electric-mc="milestones"]').forEach((tr) => tr.remove());
    }
    if (settings.highlightRevisions && r.pageType === 'queue-list') highlightRevisions(document, settings.idPattern);
    else clearHighlights(document);
    applyRestyle(document, settings);
    hidePageHeader(document, settings.hidePageHeader);
    console.debug('[electric-mc]', reason, r.pageType, r.confidence, r);
  };

  // Every manuscript page, original or revision, records its own version's
  // AE and dates, so a later revision can show them without leaving the page.
  let recorded = '';
  const recordThisVersion = (r: ParseResult) => {
    const m = r.manuscript;
    if (!m) return;
    const read = versionInfoFrom(document, m.id);
    // "AE: Not Assigned" means unknown, never a name to remember.
    const named = m.handlingEditor && !/not assigned/i.test(m.handlingEditor) ? m.handlingEditor : undefined;
    const info: VersionInfo = { ...read, ae: read.ae ?? named, responded: decisionLettersIn(document, settings.idPattern).get(m.id) ?? read.responded };
    const key = JSON.stringify(info);
    if (key === recorded) return;
    recorded = key;
    send({ type: 'version-info', baseId: m.baseId, id: m.id, ae: info.ae, info, source: 'page' });
  };

  // Earlier versions: show each one's AE in the Version History table, and
  // add the previous version's dates and editors to Peer Review Milestones,
  // from what was recorded when those versions were viewed, or else looked
  // up in a sealed offscreen frame (lib/offscreen.ts). Once per manuscript
  // per page.
  const looked = new Set<string>();
  let milestones: { on: string; info: VersionInfo } | null = null;
  const earlierVersions = async (r: ParseResult) => {
    const m = r.manuscript!;
    if (looked.has(m.id)) return;
    const links = findVersionLinks(document, m, settings.idPattern);
    if (!links.length) {
      // MC may draw Version History later; the next parse tries again.
      if (!noLinksLogged) send({ type: 'log', level: 'debug', event: 'no version links found', data: m.id });
      noLinksLogged = true;
      return;
    }
    looked.add(m.id);
    const idCol = (row: HTMLTableRowElement) => Array.from(row.cells).findIndex((c) => c.textContent?.includes(m.baseId));
    const got = await chrome.storage.local.get(KEY.seen);
    const known = (got[KEY.seen] as Record<string, SeenManuscript> | undefined)?.[m.baseId];
    const fromBackend = await askBackend(m.baseId);
    const infos: VersionInfo[] = links.map((v) => {
      const info: VersionInfo = { id: v.ref.id, ...known?.versionInfo?.[v.ref.id] };
      info.ae = fromBackend?.[v.ref.id] ?? info.ae ?? known?.aeByVersion?.[v.ref.id];
      info.submitted ??= v.submitted;
      info.responded ??= decisionLettersIn(document, settings.idPattern).get(v.ref.id);
      return info;
    });
    const show = (missingNote: string) =>
      links.forEach((v, i) => {
        const info = infos[i]!;
        annotateVersionRow(v.row, idCol(v.row), info.ae ? `AE: ${info.ae}` : missingNote);
        if (i === 0) {
          milestones = { on: m.id, info };
          if (!addMilestoneRows(document, info)) send({ type: 'log', level: 'warn', event: 'peer review milestones table not found', data: m.id });
        }
      });
    const missing = infos.filter((i) => !i.ae).map((i) => i.id);
    if (!missing.length || offscreenUnavailable || offscreenBusy) return show('AE: open this version once to record it');
    show('AE: looking it up…');
    offscreenBusy = true;
    try {
      const read = await lookupOffscreen({
        doc: document,
        current: m,
        wanted: missing,
        wantResponded: infos[0]!.responded ? undefined : infos[0]!.id,
        idPattern: settings.idPattern,
        signal: pageGone.signal,
        log: (event, data) => send({ type: 'log', level: 'info', event, data }),
      });
      for (const [i, info] of infos.entries()) {
        const r = read.get(info.id);
        if (!r) continue;
        infos[i] = { ...info, ...Object.fromEntries(Object.entries(r).filter(([, x]) => x)) };
        send({ type: 'version-info', baseId: m.baseId, id: info.id, ae: infos[i]!.ae, info: infos[i], source: 'page' });
      }
    } catch (e) {
      if (e instanceof Unavailable) {
        offscreenUnavailable = true;
        send({ type: 'log', level: 'warn', event: 'offscreen lookup unavailable', data: e.message });
      } else {
        send({ type: 'log', level: 'warn', event: 'offscreen lookup failed', data: (e as Error).message });
      }
    } finally {
      offscreenBusy = false;
    }
    show('AE: open this version once to record it');
  };
  // One offscreen lookup at a time in this tab; none once the site won't allow it.
  let offscreenBusy = false;
  let offscreenUnavailable = false;
  let noLinksLogged = false;
  const pageGone = new AbortController();
  window.addEventListener('pagehide', () => pageGone.abort());

  // Any Audit Trail on screen tells us when decisions were sent; keep them.
  const recordLetters = (r: ParseResult) => {
    const bases = new Set(r.manuscriptIds.map((m) => m.baseId));
    for (const [id, responded] of decisionLettersIn(document, settings.idPattern)) {
      const baseId = id.replace(/\.R\d+$/, '');
      if (!bases.has(baseId) || sentLetters.get(id) === responded) continue;
      sentLetters.set(id, responded);
      send({ type: 'version-info', baseId, id, info: { id, responded }, source: 'page' });
      if (milestones?.info.id === id && milestones.info.responded !== responded) {
        milestones.info = { ...milestones.info, responded };
        addMilestoneRows(document, milestones.info);
      }
    }
  };
  const sentLetters = new Map<string, string>();

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
    send({ type: 'log', level: 'info', event: 'login form annotated for password managers', data: { submit: !!f.submit, pageType: last?.pageType } });
    stopLogin = settings.autoLogin
      ? watchForAutofill(f, (how) => send({ type: 'log', level: 'info', event: 'auto-submitted login', data: how }))
      : () => {};
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
    clearHighlights(document);
    clearRestyle(document);
    hidePageHeader(document, false);
    document.querySelectorAll(`[${MARK}="milestones"], [${MARK}="version-ae"]`).forEach((e) => e.remove());
    overlay?.hide();
    stopLogin?.();
    stopLogin = null;
    last = null;
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
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
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

/**
 * What the backend knows about each version's AE, from the assignment
 * emails. The backend isn't built yet, so this always falls through to
 * reading the pages.
 */
async function askBackend(_baseId: string): Promise<Record<string, string> | null> {
  return null;
}

function idsKey(r: ParseResult): string {
  return r.manuscriptIds.map((m) => m.id).join(',');
}

function send(m: Msg) {
  chrome.runtime.sendMessage(m).catch(() => {});
}

/** Page HTML without our overlay, scripts, or anything typed into fields. */
function snapshot(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[${MARK}], script, noscript`).forEach((e) => e.remove());
  clone.querySelectorAll('input[type=password], input[type=text], input[type=email]').forEach((e) => e.setAttribute('value', ''));
  clone.querySelectorAll('textarea').forEach((e) => (e.textContent = ''));
  return '<!doctype html>\n' + clone.outerHTML;
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
