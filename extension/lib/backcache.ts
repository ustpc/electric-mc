// Back on MC. Every MC page answers a form POST and is sent with
// "Cache-Control: no-store", so Chrome keeps no copy: Back shows "Confirm
// Form Resubmission" (ERR_CACHE_MISS). Test builds drop that header from MC's
// own pages, so Chrome can show the page as it was. The Web Store build has
// no declarativeNetRequest permission and leaves MC alone.

const RULE_ID = 4101;

export const BACK_CACHE_RULE: chrome.declarativeNetRequest.Rule = {
  id: RULE_ID,
  priority: 1,
  condition: {
    requestDomains: ['manuscriptcentral.com'],
    resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType, 'sub_frame' as chrome.declarativeNetRequest.ResourceType],
  },
  action: {
    type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
    responseHeaders: [
      // "private": only this browser keeps it, never a shared cache.
      { header: 'cache-control', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'private, max-age=0' },
      { header: 'pragma', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
      { header: 'expires', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
    ],
  },
};

/** Whether this build may change MC's response headers. */
export function canKeepBackPages(): boolean {
  return chrome.runtime.getManifest().permissions?.includes('declarativeNetRequestWithHostAccess') ?? false;
}

/** Turn the rule on or off (per browser session; set again at each start). */
export async function setBackPages(on: boolean): Promise<void> {
  if (!canKeepBackPages()) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID], addRules: on ? [BACK_CACHE_RULE] : [] });
}
