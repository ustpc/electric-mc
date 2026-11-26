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
    // Developer diagnostic (lib/scriptpeek.ts): in a popup, what MC's inline
    // scripts do with the opener. Scripts are caught as MC's HTML adds them,
    // since a page that closes itself never reaches document_idle.
    const peeked: string[] = [];
    let peekOn: boolean | null = null;
    const flushPeek = () => {
      if (!peekOn || !peeked.length) return;
      const snippets = peeked.splice(0);
      try {
        chrome.runtime.sendMessage({ type: 'log', level: 'info', event: 'popup scripts', data: { snippets } }).catch(() => {});
      } catch {
        /* extension reloaded */
      }
    };
    if (window.opener) {
      const peek = new MutationObserver((records) => {
        for (const r of records)
          for (const n of Array.from(r.addedNodes))
            if (n instanceof HTMLScriptElement && !n.src && n.textContent) peeked.push(...scriptSnippets(n.textContent).filter((x) => !peeked.includes(x)));
        if (peekOn) flushPeek();
      });
      peek.observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', () => {
        peek.disconnect();
        flushPeek();
      });
      window.addEventListener('pagehide', flushPeek);
    }
    void getSettings().then((s) => {
      peekOn = s.developer && isEnabledFor(s, location.href);
      if (!peekOn) peeked.length = 0;
      flushPeek();
      enabled = isEnabledFor(s, location.href);
      if (!enabled) observer.disconnect();
      tryAnnotate();
    }, () => {});
  },
});
