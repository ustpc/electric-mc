// Back on MC. Every MC page answers a form POST and is sent with
// "Cache-Control: no-store", so Chrome keeps no copy: Back shows "Confirm
// Form Resubmission" (ERR_CACHE_MISS). Test builds drop that header from MC's
// own pages, so Chrome can show the page as it was. The Web Store build has
// no declarativeNetRequest permission and leaves MC alone.
//
// Only the main page (0.0.103). With the rule on every MC response, adding
// reviewers with Create Account On The Fly worked once and then failed: the
// manuscript page MC reloads after the popup came back without its document
// code (DOCUMENT_HASHCODE), the next popup took the empty code from it, and
// MC sent that popup's Create and Add back unchanged. So the rule now covers
// only form posts in a top-level tab (Back's "Confirm Form Resubmission" is
// only ever about posts), and never a popup, the tab that opened a popup
// while the popup is open, or that tab for a minute after the popup closes,
// when MC reloads it.

const RULE_ID = 4101;
/** How long after a popup closes its opener stays left alone. */
export const AFTER_POPUP_MS = 60_000;

const HEADERS: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [
  // "private": only this browser keeps it, never a shared cache.
  { header: 'cache-control', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'private, max-age=0' },
  { header: 'pragma', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
  { header: 'expires', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
];

/** The rule, leaving the given tabs alone. */
export function backCacheRule(excludedTabIds: number[] = []): chrome.declarativeNetRequest.Rule {
  return {
    id: RULE_ID,
    priority: 1,
    condition: {
      requestDomains: ['manuscriptcentral.com'],
      resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
      requestMethods: ['post' as chrome.declarativeNetRequest.RequestMethod],
      ...(excludedTabIds.length ? { excludedTabIds: [...excludedTabIds].sort((a, b) => a - b) } : {}),
    },
    action: { type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType, responseHeaders: HEADERS },
  };
}

export const BACK_CACHE_RULE = backCacheRule();

/**
 * Which tabs the rule leaves alone: popups (a tab another tab opened, or a
 * tab in a popup window), their openers while they are open, and an opener
 * for AFTER_POPUP_MS after its popup closes.
 */
export class PopupTabs {
  private popups = new Map<number, number | undefined>();
  private after = new Map<number, number>();

  opened(tabId: number, openerTabId: number | undefined): void {
    this.popups.set(tabId, openerTabId);
  }

  isPopup(tabId: number): boolean {
    return this.popups.has(tabId);
  }

  /** A tab closed. Returns true when the excluded set may have changed. */
  closed(tabId: number, now: number): boolean {
    this.after.delete(tabId);
    if (!this.popups.has(tabId)) return false;
    const opener = this.popups.get(tabId);
    this.popups.delete(tabId);
    if (opener !== undefined) this.after.set(opener, now + AFTER_POPUP_MS);
    return true;
  }

  excluded(now: number): number[] {
    const out = new Set<number>();
    for (const [popup, opener] of this.popups) {
      out.add(popup);
      if (opener !== undefined) out.add(opener);
    }
    for (const [tab, until] of this.after) {
      if (until > now) out.add(tab);
      else this.after.delete(tab);
    }
    return [...out].sort((a, b) => a - b);
  }
}

/** Whether this build may change MC's response headers. */
export function canKeepBackPages(): boolean {
  return chrome.runtime.getManifest().permissions?.includes('declarativeNetRequestWithHostAccess') ?? false;
}

/** Turn the rule on or off (per browser session; set again at each start), leaving the given tabs alone. */
export async function setBackPages(on: boolean, excludedTabIds: number[] = []): Promise<void> {
  if (!canKeepBackPages()) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID], addRules: on ? [backCacheRule(excludedTabIds)] : [] });
}
