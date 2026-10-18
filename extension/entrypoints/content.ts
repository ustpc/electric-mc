// Content script for every Manuscript Central page. It parses the page,
// rewrites the title, reports to the background, and shows a small debug
// badge. It re-parses when MC changes the page in place.

import { defineContentScript } from 'wxt/utils/define-content-script';
import { TitleKeeper, titleFor } from '../lib/title';
import { KEY, getSettings, type CaptureReply, type Msg, type Settings } from '../lib/messages';
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

  const run = (reason: string) => {
    let r: ParseResult;
    try {
      r = parsePage(document, location.href, { idPattern: settings.idPattern });
    } catch (e) {
      send({ type: 'log', level: 'error', event: 'parse threw', data: String(e) });
      return;
    }
    const changed = !last || last.fingerprint !== r.fingerprint || last.pageType !== r.pageType || idsKey(last) !== idsKey(r);
    last = r;
    const title = settings.rewriteTitle && window.top === window ? titleFor(r) : null;
    if (settings.rewriteTitle) titles.set(title);
    if (changed || settings.verbose || reason !== 'mutation') send({ type: 'parsed', result: r, reason, title });
    if (settings.overlay && window.top === window) (overlay ??= new Overlay()).show(r, title);
    else overlay?.hide();
    console.debug('[electric-mc]', reason, r.pageType, r.confidence, r);
  };

  run('load');

  // MC sometimes swaps content without a navigation (tabs, expanders, AJAX
  // panels). Re-parse after the page settles.
  let timer: number | undefined;
  new MutationObserver((records) => {
    if (records.every((m) => (m.target as Element).closest?.(`[${MARK}]`))) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => run('mutation'), 500);
  }).observe(document.body, { subtree: true, childList: true, characterData: true });

  // Back/forward cache restores don't re-run content scripts.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) run('bfcache');
  });

  chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
    if (msg.type === 'reparse') {
      run('manual');
      reply({ ok: true });
    } else if (msg.type === 'capture') {
      const r = parsePage(document, location.href, { idPattern: settings.idPattern });
      const out: CaptureReply = { url: location.href, title: document.title, html: snapshot(), result: r };
      reply(out);
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY.settings]) {
      void getSettings().then((s) => {
        settings = s;
        if (!s.rewriteTitle) titles.restore();
        run('settings');
      });
    }
  });
}

function idsKey(r: ParseResult): string {
  return r.manuscriptIds.map((m) => m.id).join(',');
}

function send(m: Msg) {
  chrome.runtime.sendMessage(m).catch(() => {});
}

/** Page HTML without our overlay and without scripts. */
function snapshot(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[${MARK}], script, noscript`).forEach((e) => e.remove());
  // Password fields should be empty, but make sure.
  clone.querySelectorAll('input[type=password]').forEach((e) => e.setAttribute('value', ''));
  return '<!doctype html>\n' + clone.outerHTML;
}

/** A small badge in the corner, in a shadow root so MC's CSS can't touch it. */
class Overlay {
  private host: HTMLElement;
  private box: HTMLElement;
  private open = false;

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute(MARK, 'overlay');
    this.host.style.cssText = 'all:initial;position:fixed;right:8px;bottom:8px;z-index:2147483647';
    const root = this.host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .b{font:12px/1.4 system-ui,sans-serif;background:#111827;color:#f9fafb;border-radius:8px;padding:6px 10px;
         box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:360px;cursor:pointer;opacity:.92}
      .w{color:#fbbf24} .t{font-weight:600} pre{white-space:pre-wrap;margin:6px 0 0;max-height:300px;overflow:auto;font:11px ui-monospace,monospace}
    </style><div class="b"></div>`;
    this.box = root.querySelector('.b')!;
    this.box.addEventListener('click', () => {
      this.open = !this.open;
      this.box.querySelector('pre')?.toggleAttribute('hidden', !this.open);
    });
    document.documentElement.appendChild(this.host);
  }

  show(r: ParseResult, title: string | null) {
    this.host.style.display = '';
    const ids = r.manuscriptIds.slice(0, 3).map((m) => m.id).join(', ');
    const detail = {
      title,
      alternatives: r.alternatives,
      signals: r.signals.map((s) => `${s.pageType}: ${s.name} +${s.weight}${s.detail ? ` (${s.detail})` : ''}`),
      strategies: r.strategies,
      warnings: r.warnings,
      fingerprint: r.fingerprint,
      ms: r.elapsedMs,
    };
    this.box.innerHTML = '';
    const head = document.createElement('div');
    head.innerHTML = `<span class="t"></span> <span class="c"></span> <span class="w"></span>`;
    head.querySelector('.t')!.textContent = `EMC ${r.pageType}`;
    head.querySelector('.c')!.textContent = `${Math.round(r.confidence * 100)}%${ids ? ' · ' + ids : ''}`;
    head.querySelector('.w')!.textContent = r.warnings.length ? ` ⚠ ${r.warnings.length}` : '';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(detail, null, 1);
    pre.hidden = !this.open;
    this.box.append(head, pre);
  }

  hide() {
    this.host.style.display = 'none';
  }
}
