// Background service worker: keeps the latest parse for each tab, the debug
// log, and the "seen manuscripts" index that a later build will preload from
// the backend in one query.

import { defineBackground } from 'wxt/utils/define-background';
import { appendCapped, type LogEntry } from '../lib/log';
import { KEY, getSettings, isEnabledFor, setHostEnabled, type Msg, type SeenManuscript } from '../lib/messages';
import type { VersionInfo } from '../lib/milestones';
import type { ParseResult } from '../parsers/types';

const BADGE: Record<string, string> = {
  login: 'LOG',
  'main-menu': 'MENU',
  'role-center': 'CTR',
  'queue-list': 'LIST',
  manuscript: 'MS',
  popup: 'POP',
  unknown: '?',
};

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  chrome.runtime.onInstalled.addListener((d) => {
    void log({ level: 'info', source: 'background', event: 'installed', data: { reason: d.reason, version: chrome.runtime.getManifest().version } });
    // Right-click the toolbar icon to switch the extension off or on for this site.
    chrome.contextMenus.create({ id: MENU_TOGGLE, title: 'Turn off on this site', contexts: ['action'] }, () => void chrome.runtime.lastError);
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_TOGGLE || !tab?.url) return;
    void (async () => {
      const host = new URL(tab.url!).hostname;
      const enabled = isEnabledFor(await getSettings(), tab.url);
      await setHostEnabled(host, !enabled);
      await log({ level: 'info', source: 'background', event: enabled ? 'turned off for site' : 'turned on for site', data: host });
    })();
  });

  // Keep the icon (blue on, grey off) and the menu label in step with the current tab.
  chrome.tabs.onActivated.addListener(({ tabId }) => void refreshTab(tabId));
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url || change.status === 'complete') void refreshTab(tabId);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch[KEY.settings]) {
      void chrome.tabs.query({}).then((tabs) => tabs.forEach((t) => t.id !== undefined && void refreshTab(t.id)));
    }
  });

  chrome.runtime.onMessage.addListener((msg: Msg, sender) => {
    const tabId = sender.tab?.id;
    if (msg.type === 'parsed' && tabId !== undefined) {
      void onParsed(tabId, msg.result, msg.reason, msg.title);
    } else if (msg.type === 'version-info') {
      void rememberVersion(msg.baseId, msg.id, msg.ae, msg.status, msg.info);
    } else if (msg.type === 'disabled' && tabId !== undefined) {
      void chrome.storage.session.remove(KEY.tab(tabId));
    } else if (msg.type === 'log') {
      if (msg.level === 'debug' || msg.level === 'info') {
        void getSettings().then((s) => {
          if (s.developer) void log({ level: msg.level, source: sender.tab ? 'content' : 'sidepanel', event: msg.event, tabId, data: msg.data });
        });
        return false;
      }
      void log({ level: msg.level, source: sender.tab ? 'content' : 'sidepanel', event: msg.event, tabId, data: msg.data });
    }
    return false;
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.session.remove(KEY.tab(tabId));
  });
});

const MENU_TOGGLE = 'toggle-site';
const ICON = (dir: string) => ({ 16: `${dir}/16.png`, 32: `${dir}/32.png`, 48: `${dir}/48.png`, 128: `${dir}/128.png` });

async function refreshTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab) return;
  const onMc = !!tab.url && /^https:\/\/([^/]+\.)?manuscriptcentral\.com\//.test(tab.url);
  const enabled = isEnabledFor(await getSettings(), tab.url);
  await chrome.action.setIcon({ tabId, path: ICON(onMc && !enabled ? 'icon-off' : 'icon') }).catch(() => {});
  if (onMc && !enabled) await chrome.action.setBadgeText({ tabId, text: 'OFF' }).catch(() => {});
  if (tab.active) {
    chrome.contextMenus.update(MENU_TOGGLE, { title: enabled ? 'Turn off on this site' : 'Turn on for this site', enabled: onMc }, () => void chrome.runtime.lastError);
  }
}

async function onParsed(tabId: number, result: ParseResult, reason: string, title: string | null) {
  await chrome.storage.session.set({ [KEY.tab(tabId)]: { result, reason, title, at: Date.now() } });
  const { developer } = await getSettings();
  const level = result.pageType === 'unknown' || result.warnings.length ? 'warn' : 'info';
  // Outside developer mode, log only problems, and only their summary.
  if (developer) await log({ level, source: 'content', event: `parsed (${reason})`, tabId, data: result });
  else if (level === 'warn') await log({ level, source: 'content', event: 'parse problem', tabId, data: { pageType: result.pageType, warnings: result.warnings, fingerprint: result.fingerprint } });
  await chrome.action.setBadgeText({ tabId, text: developer ? BADGE[result.pageType] ?? '?' : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: level === 'warn' ? '#b45309' : '#2563eb' });
  await remember(result);
}

/** AE (and status) of an earlier version, looked up by the content script. */
function rememberVersion(baseId: string, id: string, ae?: string, status?: string, info?: VersionInfo): Promise<void> {
  if (!ae && !status && !info) return Promise.resolve();
  return serial(async () => {
    const got = await chrome.storage.local.get(KEY.seen);
    const seen = (got[KEY.seen] as Record<string, SeenManuscript> | undefined) ?? {};
    const now = new Date().toISOString();
    const prev = seen[baseId] ?? { baseId, latestId: id, site: null, firstSeen: now, lastSeen: now, seenOn: [] };
    seen[baseId] = {
      ...prev,
      aeByVersion: ae ? { ...prev.aeByVersion, [id]: ae } : prev.aeByVersion,
      statusByVersion: status ? { ...prev.statusByVersion, [id]: status } : prev.statusByVersion,
      // Merge, so a later partial update (just the decision date) keeps what we knew.
      versionInfo: info ? { ...prev.versionInfo, [id]: { ...prev.versionInfo?.[id], ...defined(info) } } : prev.versionInfo,
    };
    await chrome.storage.local.set({ [KEY.seen]: seen });
  });
}

function defined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// Storage writes are serialized so concurrent tabs don't drop each other's entries.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

function log(e: Omit<LogEntry, 'ts'>): Promise<void> {
  return serial(async () => {
    const got = await chrome.storage.local.get(KEY.log);
    const list = (got[KEY.log] as LogEntry[] | undefined) ?? [];
    await chrome.storage.local.set({ [KEY.log]: appendCapped(list, { ts: new Date().toISOString(), ...e }) });
  });
}

function remember(r: ParseResult): Promise<void> {
  const updates: Array<Partial<SeenManuscript> & { baseId: string; latestId: string }> = [];
  if (r.manuscript) {
    const m = r.manuscript;
    const ae = m.handlingEditor && !/not assigned/i.test(m.handlingEditor) ? m.handlingEditor : undefined;
    updates.push({ baseId: m.baseId, latestId: m.id, title: m.title, status: m.status, reviewers: m.reviewers.length, aeByVersion: ae ? { [m.id]: ae } : undefined });
  }
  for (const row of r.rows ?? []) {
    updates.push({ baseId: row.baseId, latestId: row.id, title: row.title, status: row.status, queue: r.heading ?? undefined });
  }
  if (!updates.length) return Promise.resolve();
  return serial(async () => {
    const got = await chrome.storage.local.get(KEY.seen);
    const seen = (got[KEY.seen] as Record<string, SeenManuscript> | undefined) ?? {};
    const now = new Date().toISOString();
    for (const u of updates) {
      const prev = seen[u.baseId];
      const merged: SeenManuscript = {
        ...(prev ?? { baseId: u.baseId, latestId: u.latestId, site: r.site, firstSeen: now, lastSeen: now, seenOn: [] }),
      };
      const { aeByVersion, latestId, ...rest } = u;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== '') (merged as unknown as Record<string, unknown>)[k] = v;
      // Keep the highest revision seen, and every version's AE.
      if (!prev || revisionOf(latestId) >= revisionOf(prev.latestId)) merged.latestId = latestId;
      if (aeByVersion) merged.aeByVersion = { ...prev?.aeByVersion, ...aeByVersion };
      merged.lastSeen = now;
      if (!merged.seenOn.includes(r.pageType)) merged.seenOn = [...merged.seenOn, r.pageType];
      seen[u.baseId] = merged;
    }
    await chrome.storage.local.set({ [KEY.seen]: seen });
  });
}

function revisionOf(id: string): number {
  const m = /\.R(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}
