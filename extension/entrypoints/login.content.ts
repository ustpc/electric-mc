// Login hints, as early as possible. Password managers such as 1Password
// scan the page for login fields when it loads; the main content script runs
// later (document_idle), which can be after that scan. This one starts at
// document_start and labels the fields the moment MC's HTML creates them.

import { defineContentScript } from 'wxt/utils/define-content-script';
import { annotateLogin, findLoginFields, pictureAccountLinks } from '../lib/login';
import { getSettings, isEnabledFor } from '../lib/messages';
import { scriptSnippets } from '../lib/scriptpeek';

export default defineContentScript({
  matches: ['https://*.manuscriptcentral.com/*'],
  runAt: 'document_start',
  allFrames: false,
  main() {
    let enabled: boolean | null = null;
    let done = false;
    const tryAnnotate = () => {
      if (done || !enabled) return;
      const f = findLoginFields(document);
      // One password field only: never a sign-up or change-password form.
      if (!f || document.querySelectorAll('input[type=password]').length !== 1) return;
      annotateLogin(f);
      pictureAccountLinks(document);
      done = true;
      observer.disconnect();
    };
    const observer = new MutationObserver(tryAnnotate);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => {
      tryAnnotate();
      // Links drawn after the fields were found get pictured too.
      if (done) pictureAccountLinks(document);
      observer.disconnect();
    });
    // Redraw the pictures once MC's styles and fonts are in.
    const redraw = () => done && pictureAccountLinks(document);
    window.addEventListener('load', redraw);
    void document.fonts?.ready.then(redraw);
    // Developer diagnostic (lib/scriptpeek.ts): what MC's inline scripts do
    // with DOCUMENT_HASHCODE and, in a popup, with the window that opened it.
    // Scripts are caught as MC's HTML adds them and sent at once, since a
    // popup that closes itself never waits for settings; the background
    // keeps them only in developer mode.
    const seen = new Set<string>();
    const peek = new MutationObserver((records) => {
      const snippets: string[] = [];
      for (const r of records)
        for (const n of Array.from(r.addedNodes))
          if (n instanceof HTMLScriptElement && !n.src && n.textContent)
            for (const x of scriptSnippets(n.textContent)) {
              if (seen.has(x) || (!window.opener && !x.includes('DOCUMENT_HASHCODE'))) continue;
              seen.add(x);
              snippets.push(x);
            }
      if (!snippets.length) return;
      try {
        chrome.runtime.sendMessage({ type: 'log', level: 'info', event: 'page scripts', data: { popup: !!window.opener, snippets } }).catch(() => {});
      } catch {
        /* extension reloaded */
      }
    });
    peek.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => peek.disconnect());
    void getSettings().then((s) => {
      enabled = isEnabledFor(s, location.href);
      if (!enabled) observer.disconnect();
      tryAnnotate();
    }, () => {});
  },
});
