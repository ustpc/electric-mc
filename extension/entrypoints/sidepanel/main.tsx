// Side panel (and pop-out window). Shows what the parsers found on the
// current Manuscript Central tab, the seen-manuscripts index, local notes,
// the debug log and its export, and capture of page HTML for the validator.

import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { buildExport, type Level, type LogEntry } from '../../lib/log';
import { DEFAULT_SETTINGS, KEY, getSettings, isEnabledFor, setHostEnabled, type CaptureReply, type SeenManuscript, type Settings } from '../../lib/messages';
import type { ParseResult } from '../../parsers/types';

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

function useStorage<T>(area: 'local' | 'session', key: string | null, fallback: T): T {
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
  const settings = useStorage<Partial<Settings>>('local', KEY.settings, {});
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
  const flash = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const popOut = async () => {
    await chrome.windows.create({ url: chrome.runtime.getURL('sidepanel.html?popout=1'), type: 'popup', width: 440, height: 820 });
    window.close();
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
          <h1>Electric MC <span class="muted">test build {chrome.runtime.getManifest().version}</span></h1>
          {state && <span class={`pill ${state.result.warnings.length ? 'warn' : ''}`}>{state.result.pageType}</span>}
          <button class="act" onClick={POPOUT ? popIn : popOut} title={POPOUT ? 'Back into the side panel' : 'Open in its own window'}>
            {POPOUT ? 'Pop in' : 'Pop out'}
          </button>
        </div>
        <div class="row" style="margin-top:6px">
          <SiteSwitch url={url} />
        </div>
        <nav>
          {(['page', 'seen', 'notes', 'log', 'settings'] as Tab[]).map((t) => (
            <button class={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'page' && <PageView state={state} tabId={tabId} flash={flash} />}
        {tab === 'seen' && <SeenView />}
        {tab === 'notes' && <NotesView current={state?.result.manuscript?.baseId ?? state?.result.manuscriptIds[0]?.baseId} />}
        {tab === 'log' && <LogView flash={flash} />}
        {tab === 'settings' && <SettingsView />}
      </main>
      {toast && <div class="toast">{toast}</div>}
    </>
  );
}

function PageView({ state, tabId, flash }: { state: TabState | null; tabId?: number; flash: (s: string) => void }) {
  const [raw, setRaw] = useState(false);
  const [saveAs, setSaveAs] = useState(false);
  if (!state) {
    return <p class="muted">No Manuscript Central page parsed in this tab yet. Open a page on *.manuscriptcentral.com, or press Re-parse.</p>;
  }
  const r = state.result;

  const reparse = async () => {
    if (tabId === undefined) return;
    await chrome.tabs.sendMessage(tabId, { type: 'reparse' }).catch((e) => flash(`Re-parse failed: ${e}`));
  };
  const capture = async () => {
    if (tabId === undefined) return;
    try {
      const c = (await chrome.tabs.sendMessage(tabId, { type: 'capture' })) as CaptureReply;
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
      <section class="row" style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="act" onClick={reparse}>Re-parse</button>
        <button class="act" onClick={capture}>Capture page HTML</button>
        <label class="chk"><input type="checkbox" checked={saveAs} onChange={(e) => setSaveAs((e.target as HTMLInputElement).checked)} />Ask where to save</label>
      </section>
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
  );
}

function SeenView() {
  const seen = useStorage<Record<string, SeenManuscript>>('local', KEY.seen, {});
  const list = Object.values(seen).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return (
    <section>
      <h2>Manuscripts seen in this browser ({list.length})</h2>
      <p class="muted">Built from the pages you visit. The real build fills this from the backend in one query when MC opens.</p>
      <table>
        <tr><th>ID</th><th>Title</th><th>Status</th><th>Seen</th></tr>
        {list.map((m) => (
          <tr>
            <td>{m.latestId}</td>
            <td>{m.title ?? '—'}</td>
            <td>{m.status ?? m.queue ?? ''}</td>
            <td class="muted" title={m.seenOn.join(', ')}>{new Date(m.lastSeen).toLocaleString()}</td>
          </tr>
        ))}
      </table>
      {list.length > 0 && <button class="act" onClick={() => void chrome.storage.local.remove(KEY.seen)}>Clear</button>}
    </section>
  );
}

function NotesView({ current }: { current?: string }) {
  const notes = useStorage<Record<string, string>>('local', KEY.notes, {});
  const [draft, setDraft] = useState('');
  useEffect(() => setDraft(current ? notes[current] ?? '' : ''), [current, notes]);
  if (!current) return <p class="muted">Open a manuscript to see its notes.</p>;
  const save = () => void chrome.storage.local.set({ [KEY.notes]: { ...notes, [current]: draft } });
  return (
    <section>
      <h2>Notes on {current}</h2>
      <p class="muted">Stored only in this browser in the test build. Shared chat needs the backend.</p>
      <textarea value={draft} onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} onBlur={save} />
      <button class="act" onClick={save}>Save</button>
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

function SettingsView() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => void getSettings().then(setS), []);
  const update = (p: Partial<Settings>) => {
    const next = { ...s, ...p };
    setS(next);
    void chrome.storage.local.set({ [KEY.settings]: next });
  };
  const box = (k: 'overlay' | 'rewriteTitle' | 'verbose' | 'autoSubmitLogin' | 'highlightRevisions', label: string) => (
    <label class="chk"><input type="checkbox" checked={s[k]} onChange={(e) => update({ [k]: (e.target as HTMLInputElement).checked })} />{label}</label>
  );
  return (
    <section>
      <h2>Settings</h2>
      {box('highlightRevisions', 'Highlight revisions (bold, yellow row) in manuscript lists')}
      {box('autoSubmitLogin', 'Log me in once my password manager fills the login form')}
      {box('overlay', 'Show the debug badge on MC pages')}
      {box('rewriteTitle', 'Rewrite page titles (history and Back menu)')}
      {box('verbose', 'Log every re-parse, not only changes')}
      <label>
        Manuscript ID pattern (blank for default)
        <input style="width:100%" value={s.idPattern ?? ''} onChange={(e) => update({ idPattern: (e.target as HTMLInputElement).value || undefined })} />
      </label>
      {s.disabledHosts.length > 0 && <p>Off on: {s.disabledHosts.join(', ')}</p>}
      <p class="muted">Version {chrome.runtime.getManifest().version}</p>
    </section>
  );
}

render(<App />, document.getElementById('app')!);
