// Side panel (and pop-out window). Shows what the parsers found on the
// current Manuscript Central tab, the seen-manuscripts index, local notes,
// the debug log and its export, and capture of page HTML for the validator.

import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { buildExport, type Level, type LogEntry } from '../../lib/log';
import { DEFAULT_SETTINGS, KEY, SETTINGS_AREA, getSettings, isEnabledFor, panelEnabledFor, saveSettings, setHostEnabled, type CaptureReply, type SeenManuscript, type Settings } from '../../lib/messages';
import { FONT_CHOICES, MC_FONT_PX } from '../../lib/restyle';
import type { ParseResult } from '../../parsers/types';
import { filterSeen, withNote } from '../../lib/seen';

const params = new URLSearchParams(location.search);
const POPOUT = params.has('popout');

type Tab = 'page' | 'seen' | 'notes' | 'log' | 'settings';

interface TabState {
  result: ParseResult;
  reason: string;
  title: string | null;
  at: number;
}

async function currentTabId(): Promise<number | undefined> {
  if (POPOUT) {
    // The pop-out is its own window, so follow the last focused normal window.
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => undefined);
    if (!win?.id) return undefined;
    const [t] = await chrome.tabs.query({ active: true, windowId: win.id });
    return t?.id;
  }
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t?.id;
}

function useStorage<T>(area: 'local' | 'session' | 'sync', key: string | null, fallback: T): T {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => {
    if (!key) {
      setV(fallback);
      return;
    }
    let live = true;
    void chrome.storage[area].get(key).then((g) => live && setV((g[key] as T) ?? fallback));
    const on = (ch: Record<string, chrome.storage.StorageChange>, a: string) => {
      if (a === area && key in ch) setV((ch[key]?.newValue as T) ?? fallback);
    };
    chrome.storage.onChanged.addListener(on);
    return () => {
      live = false;
      chrome.storage.onChanged.removeListener(on);
    };
  }, [area, key]);
  return v;
}

function useCurrentTab(): number | undefined {
  const [id, setId] = useState<number | undefined>();
  useEffect(() => {
    const refresh = () => void currentTabId().then(setId);
    refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.windows.onFocusChanged.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.windows.onFocusChanged.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(refresh);
    };
  }, []);
  return id;
}

/** URL of the tracked tab, refreshed as it navigates. */
function useTabUrl(tabId: number | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    if (tabId === undefined) return setUrl(undefined);
    void chrome.tabs.get(tabId).then((t) => setUrl(t.url)).catch(() => setUrl(undefined));
    const on = (id: number, ch: chrome.tabs.OnUpdatedInfo) => id === tabId && ch.url && setUrl(ch.url);
    chrome.tabs.onUpdated.addListener(on);
    return () => chrome.tabs.onUpdated.removeListener(on);
  }, [tabId]);
  return url;
}

/** The per-site on/off switch at the top of the panel. */
function SiteSwitch({ url }: { url?: string }) {
  const settings = useStorage<Partial<Settings>>(SETTINGS_AREA, KEY.settings, {});
  let host: string | null = null;
  try {
    host = url ? new URL(url).hostname : null;
  } catch {
    host = null;
  }
  if (!host || !/(^|\.)manuscriptcentral\.com$/.test(host)) return <span class="muted">Not an MC page</span>;
  const on = isEnabledFor({ ...DEFAULT_SETTINGS, ...settings }, url);
  return (
    <label class="switch" title={`Electric MC on ${host}`}>
      <input type="checkbox" checked={on} onChange={() => void setHostEnabled(host!, !on)} />
      <span class="track"><span class="knob" /></span>
      {on ? 'On' : 'Off'} for this site
    </label>
  );
}

/** Messages to the content script go to the tab's top frame only. */
const TOP = { frameId: 0 };

/**
 * Chrome doesn't put a new build into tabs that were already open, so they
 * keep running the old code until reloaded. Ask the tab which version it
 * runs. A different version is stale at once; no answer may just mean MC is
 * between pages (its URL often doesn't change), so the tab is asked again,
 * and asked afresh whenever it finishes loading.
 */
function StaleTab({ tabId, url }: { tabId?: number; url?: string }) {
  const [stale, setStale] = useState<string | null>(null);
  useEffect(() => {
    setStale(null);
    if (tabId === undefined || !panelEnabledFor(url)) return;
    const mine = chrome.runtime.getManifest().version;
    const timers: number[] = [];
    const ask = (triesLeft: number) =>
      chrome.tabs
        .sendMessage(tabId, { type: 'ping' }, TOP)
        .then((r: { version?: string } | undefined) => r?.version ?? Promise.reject(new Error('no version')))
        .then((v: string) => setStale(v === mine ? null : v))
        .catch(() => {
          if (triesLeft > 0) timers.push(window.setTimeout(() => void ask(triesLeft - 1), 1500));
          else setStale('an older build');
        });
    const check = () => {
      timers.splice(0).forEach(clearTimeout);
      timers.push(window.setTimeout(() => void ask(2), 800));
    };
    const loaded = (id: number, change: { status?: string }) => {
      if (id === tabId && change.status === 'complete') check();
    };
    chrome.tabs.onUpdated.addListener(loaded);
    check();
    return () => {
      chrome.tabs.onUpdated.removeListener(loaded);
      timers.forEach(clearTimeout);
    };
  }, [tabId, url]);
  if (!stale || tabId === undefined) return null;
  return (
    <div class="stale">
      This tab is running {stale.startsWith('an') ? stale : `v${stale}`}.{' '}
      <button class="act" onClick={() => void chrome.tabs.reload(tabId).catch(() => {})}>Reload tab</button>
    </div>
  );
}

async function download(name: string, body: string, type: string, saveAs: boolean) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  try {
    await chrome.downloads.download({ url, filename: `electric-mc/${name}`, saveAs, conflictAction: 'uniquify' });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function logFromPanel(level: Level, event: string, data?: unknown) {
  void chrome.runtime.sendMessage({ type: 'log', level, event, data }).catch(() => {});
}

function App() {
  const [tab, setTab] = useState<Tab>('page');
  const [toast, setToast] = useState<string | null>(null);
  const tabId = useCurrentTab();
  const state = useStorage<TabState | null>('session', tabId !== undefined ? KEY.tab(tabId) : null, null);
  const url = useTabUrl(tabId);
  const saved = useStorage<Partial<Settings>>(SETTINGS_AREA, KEY.settings, {});
  const dev = !!saved.developer;
  const flash = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const popOut = async () => {
    await chrome.windows.create({ url: chrome.runtime.getURL('sidepanel.html?popout=1'), type: 'popup', width: 440, height: 820 });
    window.close();
  };
  // The Opinions editorial matrix, in its own window; one window only.
  const openMatrix = async () => {
    const url = chrome.runtime.getURL('matrix.html');
    const [open] = await chrome.tabs.query({ url });
    if (open?.windowId !== undefined) {
      await chrome.windows.update(open.windowId, { focused: true });
      return;
    }
    await chrome.windows.create({ url, type: 'popup', width: 1280, height: 900 });
  };
  const popIn = async () => {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (win.id !== undefined) await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  };

  return (
    <>
      <header>
        <div class="row">
          <h1>Electric MC <span class="muted">test build v{chrome.runtime.getManifest().version}</span></h1>
          {dev && state && <span class={`pill ${state.result.warnings.length ? 'warn' : ''}`}>{state.result.pageType}</span>}
          <button class="act" onClick={() => void openMatrix()} title="The Opinions editorial matrix, with each AE's current assignments">Matrix</button>
          <button class="act" onClick={POPOUT ? popIn : popOut} title={POPOUT ? 'Back into the side panel' : 'Open in its own window'}>
            {POPOUT ? 'Pop in' : 'Pop out'}
          </button>
        </div>
        <div class="row" style="margin-top:6px">
          <SiteSwitch url={url} />
        </div>
        <StaleTab tabId={tabId} url={url} />
        <nav>
          {((dev ? ['page', 'seen', 'notes', 'log', 'settings'] : ['page', 'seen', 'notes', 'settings']) as Tab[]).map((t) => (
            <button class={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'page' && <PageView state={state} tabId={tabId} flash={flash} dev={dev} />}
        {tab === 'seen' && <SeenView tabId={tabId} url={url} flash={flash} />}
        {tab === 'notes' && <NotesView current={state?.result.manuscript?.baseId ?? state?.result.manuscriptIds[0]?.baseId} />}
        {tab === 'log' && dev && <LogView flash={flash} />}
        {tab === 'settings' && <SettingsView />}
      </main>
      {toast && <div class="toast">{toast}</div>}
    </>
  );
}

function PageView({ state, tabId, flash, dev }: { state: TabState | null; tabId?: number; flash: (s: string) => void; dev: boolean }) {
  const [raw, setRaw] = useState(false);
  const [saveAs, setSaveAs] = useState(false);
  if (!state) {
    return <p class="muted">No Manuscript Central page parsed in this tab yet. Open a page on *.manuscriptcentral.com.</p>;
  }
  const r = state.result;

  const reparse = async () => {
    if (tabId === undefined) return;
    await chrome.tabs.sendMessage(tabId, { type: 'reparse' }, TOP).catch((e) => flash(`Re-parse failed: ${e}`));
  };
  const capture = async () => {
    if (tabId === undefined) return;
    try {
      const c = (await chrome.tabs.sendMessage(tabId, { type: 'capture' }, TOP)) as CaptureReply;
      const meta = {
        url: c.url,
        title: c.title,
        capturedAt: new Date().toISOString(),
        parserVersion: c.result.parserVersion,
        pageType: c.result.pageType,
        fingerprint: c.result.fingerprint,
      };
      // The header is a comment so the file still opens as a page. The
      // validator reads it to know what the page was classified as.
      const body = `<!-- electric-mc-capture ${JSON.stringify(meta).replace(/--/g, '\\u002d\\u002d')} -->\n${c.html}`;
      const name = `captures/${r.site ?? 'mc'}-${c.result.pageType}-${stamp()}.capture.html`;
      await download(name, body, 'text/html', saveAs);
      logFromPanel('info', 'captured page', { pageType: c.result.pageType, bytes: body.length });
      flash(`Saved Downloads/electric-mc/${name}. It contains manuscript data: keep it private.`);
    } catch (e) {
      flash(`Capture failed: ${e}`);
    }
  };

  return (
    <>
      {dev && (
      <section class="row" style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="act" onClick={reparse}>Re-parse</button>
        <button class="act" onClick={capture}>Capture page HTML</button>
        <label class="chk"><input type="checkbox" checked={saveAs} onChange={(e) => setSaveAs((e.target as HTMLInputElement).checked)} />Ask where to save</label>
      </section>
      )}
      {dev && (
        <>
      <section>
        <h2>Classification</h2>
        <table>
          <tr><th>Type</th><td>{r.pageType} ({Math.round(r.confidence * 100)}%)</td></tr>
          <tr><th>Runner-up</th><td>{r.alternatives.slice(1).map((a) => `${a.pageType} ${a.score}`).join(', ')}</td></tr>
          <tr><th>Heading</th><td>{r.heading ?? '—'}</td></tr>
          <tr><th>Context</th><td>{r.context ?? '—'}</td></tr>
          <tr><th>New title</th><td>{state.title ?? '(unchanged)'}</td></tr>
          <tr><th>Site</th><td>{r.site ?? '—'}</td></tr>
          <tr><th>Fingerprint</th><td><code>{r.fingerprint}</code></td></tr>
          <tr><th>Parsed</th><td>{new Date(r.parsedAt).toLocaleTimeString()} ({state.reason}, {r.elapsedMs} ms)</td></tr>
        </table>
      </section>
      {r.warnings.length > 0 && (
        <section>
          <h2>Warnings</h2>
          <ul class="warn">{r.warnings.map((w) => <li>{w}</li>)}</ul>
        </section>
      )}
        </>
      )}
      {r.manuscript && (
        <section>
          <h2>Manuscript</h2>
          <table>
            <tr><th>ID</th><td>{r.manuscript.id}{r.manuscript.revision ? ` (revision ${r.manuscript.revision})` : ''}</td></tr>
            <tr><th>Title</th><td>{r.manuscript.title ?? '—'}</td></tr>
            <tr><th>Status</th><td>{r.manuscript.status ?? '—'}</td></tr>
            <tr><th>Type</th><td>{r.manuscript.type ?? '—'}</td></tr>
            <tr><th>Submitted</th><td>{r.manuscript.submitted ?? '—'}</td></tr>
            <tr><th>Authors</th><td>{r.manuscript.authors ?? '—'}</td></tr>
            <tr><th>Editor</th><td>{r.manuscript.handlingEditor ?? '—'}</td></tr>
            <EarlierAes baseId={r.manuscript.baseId} current={r.manuscript.id} />
            <tr><th>Reviewers</th><td>{r.manuscript.reviewers.map((p) => `${p.name}${p.status ? ` (${p.status})` : ''}`).join('; ') || '—'}</td></tr>
          </table>
        </section>
      )}
      {r.queues && (
        <section>
          <h2>Queues</h2>
          <table>{r.queues.map((q) => <tr><td>{q.name}</td><td>{q.count}</td></tr>)}</table>
        </section>
      )}
      {r.rows && (
        <section>
          <h2>Rows ({r.rows.length})</h2>
          <table>{r.rows.map((x) => <tr><td>{x.id}</td><td>{x.title ?? '—'}</td><td>{x.status ?? ''}</td></tr>)}</table>
        </section>
      )}
      {dev && (
        <>
      <section>
        <h2>Signals</h2>
        <table>{r.signals.map((s) => <tr><td>{s.pageType}</td><td>{s.name}</td><td>+{s.weight}</td><td class="muted">{s.detail ?? ''}</td></tr>)}</table>
      </section>
      <section>
        <h2>Strategies</h2>
        <table>{Object.entries(r.strategies).map(([k, v]) => <tr><th>{k}</th><td>{v}</td></tr>)}</table>
      </section>
      <section>
        <button class="act" onClick={() => setRaw(!raw)}>{raw ? 'Hide' : 'Show'} raw JSON</button>
        {raw && <pre>{JSON.stringify(r, null, 2)}</pre>}
      </section>
        </>
      )}
    </>
  );
}

/** AEs of earlier versions of this manuscript, from pages seen before. */
function EarlierAes({ baseId, current }: { baseId: string; current: string }) {
  const seen = useStorage<Record<string, SeenManuscript>>('local', KEY.seen, {});
  const byVersion = seen[baseId]?.aeByVersion ?? {};
  const earlier = Object.entries(byVersion).filter(([id]) => id !== current).sort(([a], [b]) => b.localeCompare(a));
  return (
    <tr>
      <th>Earlier AEs</th>
      <td>
        {earlier.length ? earlier.map(([id, ae]) => <div>{id.slice(baseId.length) || 'original'}: {ae}</div>) : <span class="muted">none seen yet</span>}
      </td>
    </tr>
  );
}

function SeenView({ tabId, url, flash }: { tabId?: number; url?: string; flash: (s: string) => void }) {
  // Opens the manuscript in the current MC tab through MC's own search.
  const open = async (id: string) => {
    if (tabId === undefined || !url || !/^https:\/\/([^/]+\.)?manuscriptcentral\.com\//.test(url)) return flash('Switch to a Manuscript Central tab first.');
    const r = (await chrome.tabs.sendMessage(tabId, { type: 'open', id }, TOP).catch(() => null)) as { ok?: boolean } | null;
    if (!r?.ok) flash('No search box on this page. Go to a dashboard page and try again.');
  };
  const seen = useStorage<Record<string, SeenManuscript>>('local', KEY.seen, {});
  const [query, setQuery] = useState('');
  const all = Object.values(seen).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  const list = filterSeen(all, query);
  return (
    <section>
      <h2>Manuscripts seen in this browser ({query.trim() ? `${list.length} of ${all.length}` : all.length})</h2>
      <p class="muted">Built from the pages you visit. The real build fills this from the backend in one query when MC opens.</p>
      <input
        class="search"
        type="search"
        placeholder="Search ID or title"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <table>
        <tr><th>ID</th><th>Title</th><th>Status</th><th>Seen</th></tr>
        {list.map((m) => (
          <tr>
            <td><a href="#" onClick={(e) => { e.preventDefault(); void open(m.latestId); }} title="Open in MC">{m.latestId}</a></td>
            <td>{m.title ?? '—'}</td>
            <td class="lines">{m.status ?? m.queue ?? ''}</td>
            <td class="muted" title={m.seenOn.join(', ')}>{new Date(m.lastSeen).toLocaleString()}</td>
          </tr>
        ))}
      </table>
      {all.length > 0 && <button class="act" onClick={() => void chrome.storage.local.remove(KEY.seen)}>Clear</button>}
    </section>
  );
}

/** Notes save themselves: shortly after typing stops, on leaving the box, and on switching manuscript. */
const NOTE_SAVE_MS = 600;

async function saveNote(id: string, text: string) {
  // Read just before writing, so a note saved in another window isn't lost.
  const got = (await chrome.storage.local.get(KEY.notes))[KEY.notes] as Record<string, string> | undefined;
  await chrome.storage.local.set({ [KEY.notes]: withNote(got ?? {}, id, text) });
}

function NotesView({ current }: { current?: string }) {
  const notes = useStorage<Record<string, string>>('local', KEY.notes, {});
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const pending = useRef<{ id: string; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const focused = useRef(false);
  const flush = () => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) void saveNote(p.id, p.text).then(() => setStatus('Saved')).catch((e) => setStatus(`Not saved: ${e}`));
  };
  // A new manuscript: save the old one's note and show the new one's.
  useEffect(() => {
    flush();
    setStatus('');
    setDraft(current ? notes[current] ?? '' : '');
  }, [current]);
  // Stored notes changed (loaded, or edited in another window): show them,
  // unless the person is typing here.
  useEffect(() => {
    if (!pending.current && !focused.current) setDraft(current ? notes[current] ?? '' : '');
  }, [notes]);
  useEffect(() => {
    addEventListener('pagehide', flush);
    return () => {
      removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  if (!current) return <p class="muted">Open a manuscript to see its notes.</p>;
  const edit = (text: string) => {
    setDraft(text);
    setStatus('Saving…');
    pending.current = { id: current, text };
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, NOTE_SAVE_MS);
  };
  return (
    <section>
      <h2>Notes on {current}</h2>
      <p class="muted">Stored only in this browser in the test build, and saved as you type. Shared chat needs the backend.</p>
      <textarea
        value={draft}
        onFocus={() => (focused.current = true)}
        onInput={(e) => edit((e.target as HTMLTextAreaElement).value)}
        onBlur={() => {
          focused.current = false;
          flush();
        }}
      />
      <p class="muted">{status}</p>
    </section>
  );
}

function LogView({ flash }: { flash: (s: string) => void }) {
  const log = useStorage<LogEntry[]>('local', KEY.log, []);
  const [level, setLevel] = useState<Level | 'all'>('all');
  const [saveAs, setSaveAs] = useState(false);
  const order: Level[] = ['debug', 'info', 'warn', 'error'];
  const shown = log.filter((e) => level === 'all' || order.indexOf(e.level) >= order.indexOf(level)).slice(-300).reverse();

  const exp = async (redacted: boolean) => {
    const data = buildExport(log, redacted, chrome.runtime.getManifest().version, navigator.userAgent);
    const name = `logs/electric-mc-log-${redacted ? 'redacted' : 'FULL'}-${stamp()}.json`;
    await download(name, JSON.stringify(data, null, 1), 'application/json', saveAs);
    flash(redacted ? `Saved Downloads/electric-mc/${name}. This one is safe to send us.` : `Saved Downloads/electric-mc/${name}. It contains names and titles: don't share it.`);
  };

  return (
    <>
      <section style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button class="act" onClick={() => void exp(true)}>Export for sharing (redacted)</button>
        <button class="act" onClick={() => void exp(false)}>Export full</button>
        <button class="act" onClick={() => void chrome.storage.local.set({ [KEY.log]: [] })}>Clear</button>
        <label class="chk"><input type="checkbox" checked={saveAs} onChange={(e) => setSaveAs((e.target as HTMLInputElement).checked)} />Ask where to save</label>
      </section>
      <section>
        <h2>Log ({log.length} entries, newest first)</h2>
        <select value={level} onChange={(e) => setLevel((e.target as HTMLSelectElement).value as Level | 'all')}>
          <option value="all">all</option>
          {order.map((l) => <option value={l}>{l}+</option>)}
        </select>
        <table class="log">
          {shown.map((e) => (
            <tr class={e.level}>
              <td>{e.ts.slice(11, 19)}</td>
              <td>{e.level}</td>
              <td>{e.event}</td>
              <td>{summary(e.data)}</td>
            </tr>
          ))}
        </table>
      </section>
    </>
  );
}

function summary(d: unknown): string {
  if (!d || typeof d !== 'object') return d === undefined ? '' : String(d);
  const r = d as Partial<ParseResult>;
  if (r.pageType) {
    const n = r.rows ? ` ${r.rows.length} rows` : r.queues ? ` ${r.queues.length} queues` : r.manuscript ? ` ${r.manuscript.id}` : '';
    return `${r.pageType} ${Math.round((r.confidence ?? 0) * 100)}%${n}${r.warnings?.length ? ` ⚠ ${r.warnings.join('; ')}` : ''}`;
  }
  return JSON.stringify(d).slice(0, 160);
}

/**
 * Remove everything Electric MC stored about manuscripts: Seen, notes, the
 * log, AE workloads, the loaded roster and each tab's latest parse. Settings stay, and so does the record of
 * tabs whose side panel is switched off, which Chrome needs to put it back.
 */
async function clearAllData() {
  if (!window.confirm('Clear all Electric MC data in this browser: the Seen list, your notes, the log, AE assignment counts and the Opinions roster? Your settings are kept. This cannot be undone.')) return;
  await chrome.storage.local.remove([KEY.seen, KEY.notes, KEY.log, KEY.aeLoad, KEY.roster]);
  const session = await chrome.storage.session.get(null);
  await chrome.storage.session.remove(Object.keys(session).filter((k) => k.startsWith('tab:')));
}

function SettingsView() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => void getSettings().then(setS), []);
  // Changes made elsewhere (the toolbar menu, another window) show up here too.
  const synced = useStorage<Partial<Settings> | null>(SETTINGS_AREA, KEY.settings, null);
  useEffect(() => {
    if (synced) setS({ ...DEFAULT_SETTINGS, ...synced });
  }, [synced]);
  const update = (p: Partial<Settings>) => {
    const next = { ...s, ...p };
    setS(next);
    void saveSettings(next);
  };
  const box = (k: 'developer' | 'rewriteTitle' | 'autoLogin' | 'autoTakeAction' | 'highlightRevisions' | 'lookupEarlierVersions' | 'autoAttach', label: string) => (
    <label class="chk"><input type="checkbox" checked={s[k]} onChange={(e) => update({ [k]: (e.target as HTMLInputElement).checked })} />{label}</label>
  );
  return (
    <section>
      <h2>Page layout</h2>
      <label class="chk"><input type="checkbox" checked={s.fullWidth} onChange={(e) => update({ fullWidth: (e.target as HTMLInputElement).checked })} />Use the full window width (half an inch margin)</label>
      <label class="chk">
        Text size
        <select value={String(s.fontSize)} onChange={(e) => update({ fontSize: Number((e.target as HTMLSelectElement).value) })}>
          {FONT_CHOICES.map((n) => <option value={String(n)}>{n ? `${n}px` : `MC default (${MC_FONT_PX}px)`}</option>)}
        </select>
      </label>
      <label class="chk"><input type="checkbox" checked={s.hidePageHeader} onChange={(e) => update({ hidePageHeader: (e.target as HTMLInputElement).checked })} />Hide the text "search results" and its wasted column space</label>
      <h2 style="margin-top:12px">Features</h2>
      {box('highlightRevisions', 'Highlight revisions (bold, yellow row) in manuscript lists')}
      {box('autoLogin', 'Log me in once my password manager fills the login form')}
      {box('lookupEarlierVersions', 'On a revision, look up the AEs of earlier versions')}
      {box('rewriteTitle', 'Rewrite page titles (history and Back menu)')}
      {box('autoTakeAction', 'Always Take Action after a search that finds a single manuscript')}
      {box('autoAttach', 'Press Attach as soon as I select a file')}
      <h2 style="margin-top:12px">Developer</h2>
      {box('developer', 'Developer mode: debug badge, full log, capture, raw data')}
      {s.developer && <label>
        Manuscript ID pattern (blank for default)
        <input style="width:100%" value={s.idPattern ?? ''} onChange={(e) => update({ idPattern: (e.target as HTMLInputElement).value || undefined })} />
      </label>}
      {s.disabledHosts.length > 0 && <p>Off on: {s.disabledHosts.join(', ')}</p>}
      <p class="muted">Saved in your Chrome profile, so they follow you to any computer where you're signed in to Chrome. Version v{chrome.runtime.getManifest().version}</p>
      <h2 style="margin-top:12px">Stored data</h2>
      <p>Manuscripts you haven't viewed in 2 years are removed automatically.</p>
      <button class="act" onClick={() => void clearAllData()}>Clear all data</button>
    </section>
  );
}

render(<App />, document.getElementById('app')!);
