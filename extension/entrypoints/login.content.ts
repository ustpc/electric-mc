// Login hints, as early as possible. Password managers such as 1Password
// scan the page for login fields when it loads; the main content script runs
// later (document_idle), which can be after that scan. This one starts at
// document_start and labels the fields the moment MC's HTML creates them.

import { defineContentScript } from 'wxt/utils/define-content-script';
import { annotateLogin, findLoginFields } from '../lib/login';
import { getSettings, isEnabledFor } from '../lib/messages';

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
      done = true;
      observer.disconnect();
    };
    const observer = new MutationObserver(tryAnnotate);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => {
      tryAnnotate();
      observer.disconnect();
    });
    void getSettings().then((s) => {
      enabled = isEnabledFor(s, location.href);
      if (!enabled) observer.disconnect();
      tryAnnotate();
    });
  },
});
