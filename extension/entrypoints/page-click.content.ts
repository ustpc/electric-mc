// Clicks on MC's own links, run in the page's world. MC's links are mostly
// javascript: URLs, and Chrome blocks a javascript: URL that an extension's
// content script clicks (it runs under the extension's CSP, not the page's).
// The content script marks the element and asks this script to click it.
// It also restarts MC's logout countdown after a keepalive (lib/pagetimer.ts).

import { defineContentScript } from 'wxt/utils/define-content-script';
import { CLICK_ATTR, CLICK_EVENT } from '../lib/click';
import { RESTART_EVENT, RESTARTED_ATTR, watchLongTimers } from '../lib/pagetimer';

export default defineContentScript({
  matches: ['https://*.manuscriptcentral.com/*'],
  runAt: 'document_start',
  allFrames: false,
  world: 'MAIN',
  main() {
    // MC's logout countdown (lib/pagetimer.ts): noted as the page sets it,
    // started again when the content script says a keepalive got through.
    // Not in a popup MC opened: those are left as MC made them (0.0.104).
    if (!window.opener) {
      const timers = watchLongTimers(window);
      document.addEventListener(RESTART_EVENT, () => {
        document.documentElement.setAttribute(RESTARTED_ATTR, String(timers.restart()));
      });
    }
    document.addEventListener(CLICK_EVENT, (e) => {
      const token = (e as CustomEvent<string>).detail;
      const el = document.querySelector<HTMLElement>(`[${CLICK_ATTR}="${CSS.escape(String(token))}"]`);
      if (!el) return;
      el.removeAttribute(CLICK_ATTR);
      el.click();
    });
  },
});
