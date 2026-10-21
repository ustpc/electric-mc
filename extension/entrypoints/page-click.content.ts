// Clicks on MC's own links, run in the page's world. MC's links are mostly
// javascript: URLs, and Chrome blocks a javascript: URL that an extension's
// content script clicks (it runs under the extension's CSP, not the page's).
// The content script marks the element and asks this script to click it.

import { defineContentScript } from 'wxt/utils/define-content-script';
import { CLICK_ATTR, CLICK_EVENT } from '../lib/click';

export default defineContentScript({
  matches: ['https://*.manuscriptcentral.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    document.addEventListener(CLICK_EVENT, (e) => {
      const token = (e as CustomEvent<string>).detail;
      const el = document.querySelector<HTMLElement>(`[${CLICK_ATTR}="${CSS.escape(String(token))}"]`);
      if (!el) return;
      el.removeAttribute(CLICK_ATTR);
      el.click();
    });
  },
});
