// Content script for every Manuscript Central page. It parses the page,
// rewrites the title, helps password managers on the login page, reports to
// the background, and (optionally) shows a small debug badge. It re-parses
// when MC changes the page in place. Nothing runs on sites switched off.

import { defineContentScript } from 'wxt/utils/define-content-script';
import { annotateLogin, findLoginFields, watchForAutofill } from '../lib/login';
import { KEY, getSettings, isEnabledFor, type CaptureReply, type Msg, type Settings } from '../lib/messages';
import { TitleKeeper, titleFor } from '../lib/title';
import { parsePage } from '../parsers';
import type { ParseResult } from '../parsers/types';

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
  let settings: Settings = await getSettings();
  const titles = new TitleKeeper(document, (from, to) => send({ type: 'log', level: 'debug', event: 'title reapplied', data: { from, to } }));
  let last: ParseResult | null = null;
  let overlay: Overlay | null = null;
  let stopLogin: (() => void) | null = null;
  let observer: MutationObserver | null = null;
  let timer: number | undefined;

  const enabled = () => isEnabledFor(settings, location.href);

  const run = (reason: string) => {
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
    if (changed || settings.verbose || reason !== 'mutation') send({ type: 'parsed', result: r, reason, title });
    if (settings.overlay) (overlay ??= new Overlay()).show(r, title);
    else overlay?.hide();
    if (r.pageType === 'login' && !stopLogin) setUpLogin();
    console.debug('[electric-mc]', reason, r.pageType, r.confidence, r);
  };

  const setUpLogin = () => {
    const f = findLoginFields(document);
    if (!f) {
      send({ type: 'log', level: 'warn', event: 'login fields not found' });
      return;
    }
    annotateLogin(f);
    send({ type: 'log', level: 'info', event: 'login form annotated for password managers', data: { submit: !!f.submit } });
    stopLogin = settings.autoSubmitLogin
      ? watchForAutofill(f, (how) => send({ type: 'log', level: 'info', event: 'auto-submitted login', data: how }))
      : () => {};
  };

  const turnOn = () => {
    // MC sometimes swaps content without a navigation (tabs, expanders, AJAX
    // panels). Re-parse after the page settles.
    observer ??= new MutationObserver((records) => {
      if (records.every((m) => (m.target as Element).closest?.(`[${MARK}]`))) return;
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
    overlay?.hide();
    stopLogin?.();
    stopLogin = null;
    last = null;
    send({ type: 'disabled' });
  };

  if (enabled()) turnOn();
  else send({ type: 'disabled' });

  // Back/forward cache restores don't re-run content scripts.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) run('bfcache');
  });

  chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
    if (msg.type === 'reparse') {
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
    if (area !== 'local' || !changes[KEY.settings]) return;
    void getSettings().then((s) => {
      const was = enabled();
      settings = s;
      if (was && !enabled()) return turnOff();
      if (!was && enabled()) return turnOn();
      if (!s.rewriteTitle) titles.restore();
      if (!s.autoSubmitLogin) {
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
