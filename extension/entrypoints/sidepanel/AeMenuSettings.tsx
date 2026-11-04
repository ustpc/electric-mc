// "AE assignment menu" in the side panel's Settings tab: the layout MC's
// Assign Associate Editor pull-down is regrouped and styled with
// (lib/aemenu.ts). The person edits this browser's config as JSON, starts it
// from the Opinions co-chair layout, saves or loads it as a file, and picks
// whether the menu follows this browser's config or the server's. Server
// configs aren't built yet; their buttons say so. The preview shows how many
// editors from the last pull-down seen land in each group, never their names.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { KEY } from '../../lib/messages';
import { defaultAeMenu, fetchServerAeMenu, groupCounts, parseAeMenu, pushServerAeMenu, type AeMenuConfig, type AeMenuStore } from '../../lib/aemenu';
import type { AeLoad } from '../../lib/aeload';
import { latestJournal } from '../../lib/matrix';
import type { Roster } from '../../lib/roster';

function useLocal<T>(key: string, fallback: T): T {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => {
    let live = true;
    void chrome.storage.local.get(key).then((got) => live && setV((got[key] as T) ?? fallback));
    const on = (ch: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && key in ch) setV((ch[key]?.newValue as T) ?? fallback);
    };
    chrome.storage.onChanged.addListener(on);
    return () => {
      live = false;
      chrome.storage.onChanged.removeListener(on);
    };
  }, [key]);
  return v;
}

const pretty = (c: AeMenuConfig | undefined) => (c ? JSON.stringify(c, null, 2) : '');

async function saveStore(change: (s: AeMenuStore) => AeMenuStore): Promise<void> {
  const now = ((await chrome.storage.local.get(KEY.aeMenu))[KEY.aeMenu] as AeMenuStore | undefined) ?? { source: 'local' };
  await chrome.storage.local.set({ [KEY.aeMenu]: change(now) });
}

export function AeMenuSettings({ notesServer, flash }: { notesServer: string; flash: (s: string) => void }) {
  const store = useLocal<AeMenuStore>(KEY.aeMenu, { source: 'local' });
  const roster = useLocal<Roster | null>(KEY.roster, null);
  const loads = useLocal<Record<string, AeLoad>>(KEY.aeLoad, {});
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The editor follows the stored config until the person starts typing.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setText(pretty(store.local));
  }, [store.local, dirty]);

  const draft = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return parseAeMenu(JSON.parse(text));
    } catch (e) {
      return e as Error;
    }
  }, [text]);
  const shown = store.source === 'server' ? store.server : draft instanceof Error ? undefined : (draft ?? undefined);
  const journal = latestJournal(loads);
  const names = journal ? (loads[journal]?.entries ?? []).map((e) => e.name) : [];
  const counts = shown && names.length ? groupCounts(names, shown, roster) : null;

  const saveLocal = async (c: AeMenuConfig) => {
    await saveStore((s) => ({ ...s, local: c }));
    setDirty(false);
    setError(null);
  };
  const save = async () => {
    try {
      await saveLocal(parseAeMenu(JSON.parse(text)));
      flash('AE menu config saved');
    } catch (e) {
      setError(e instanceof SyntaxError ? `Not valid JSON: ${e.message}` : (e as Error).message);
    }
  };
  const startDefault = async () => {
    if (store.local && !window.confirm('Replace this browser\'s AE menu config with the Opinions co-chair layout?')) return;
    await saveLocal(defaultAeMenu());
    flash('Opinions co-chair layout saved');
  };
  const toggle = async (on: boolean) => {
    const base = store.local ?? defaultAeMenu();
    await saveLocal({ ...base, enabled: on });
  };
  const fromServer = async () => {
    try {
      const c = await fetchServerAeMenu(notesServer);
      await saveStore((s) => ({ ...s, server: c, serverFetchedAt: new Date().toISOString() }));
      flash('Server config fetched');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const copyServer = async () => {
    if (!store.server) return;
    if (store.local && !window.confirm("Replace this browser's AE menu config with the server's?")) return;
    await saveLocal(store.server);
    flash("Server config copied to this browser");
  };
  const push = async () => {
    try {
      if (!store.local) throw new Error('There is no config in this browser to send.');
      await pushServerAeMenu(notesServer, store.local);
      flash('Config sent to the server');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([text || pretty(store.local)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ae-menu.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      await saveLocal(parseAeMenu(JSON.parse(await f.text())));
      flash(`Loaded ${f.name}`);
    } catch (e) {
      setError(`${f.name}: ${(e as Error).message}`);
    }
  };

  const on = store.source === 'server' ? !!store.server?.enabled : !!store.local?.enabled;
  return (
    <>
      <h2 style="margin-top:12px">AE assignment menu</h2>
      <label class="chk">
        <input type="checkbox" checked={on} disabled={store.source === 'server'} onChange={(e) => void toggle((e.target as HTMLInputElement).checked)} />
        Group and color the Assign Associate Editor pull-down
      </label>
      <p class="muted">Reorders the editors under dividers and colors each group. MC's choices and what it submits don't change. The groups use the roster loaded in the Matrix window.</p>
      <label class="chk">
        <input type="radio" name="aemenu-source" checked={store.source !== 'server'} onChange={() => void saveStore((s) => ({ ...s, source: 'local' }))} />
        Use this browser's config
      </label>
      <label class="chk">
        <input type="radio" name="aemenu-source" checked={store.source === 'server'} disabled={!store.server} onChange={() => void saveStore((s) => ({ ...s, source: 'server' }))} />
        Use the server's config {store.server ? `(fetched ${store.serverFetchedAt?.slice(0, 10) ?? ''})` : '(fetch it first)'}
      </label>
      <div class="note-actions" style="flex-wrap:wrap;margin:4px 0">
        <button class="act" onClick={() => void startDefault()}>Start from the Opinions co-chair layout</button>
        <button class="act" onClick={() => void fromServer()}>Fetch from server</button>
        <button class="act" disabled={!store.server} onClick={() => void copyServer()}>Copy server config here</button>
        <button class="act" disabled={!store.local} onClick={() => void push()} title="For co-chairs the server lets change the shared config">Send mine to the server</button>
      </div>
      {counts && shown && (
        <p class="muted">
          In the last pull-down seen ({names.length} editors):{' '}
          {[...shown.groups.map((g) => g.label), shown.rest.label].map((l, i) => `${l} ${counts[i]}`).join(' · ')}
          {!roster && shown.groups.some((g) => g.rosterGroup) ? ' · no roster loaded, so roster groups are empty' : ''}
        </p>
      )}
      {store.source !== 'server' && (
        <>
          <textarea
            style="min-height:220px;font:11px/1.4 ui-monospace,monospace"
            spellcheck={false}
            value={text}
            placeholder='Start from the Opinions co-chair layout, or load an ae-menu.json file.'
            onInput={(e) => {
              setText((e.target as HTMLTextAreaElement).value);
              setDirty(true);
              setError(null);
            }}
          />
          {draft instanceof Error && text.trim() && <p class="warn">{draft.message}</p>}
          <div class="note-actions" style="flex-wrap:wrap;margin:4px 0">
            <button class="act" disabled={!dirty} onClick={() => void save()}>Save</button>
            <button class="act" disabled={!dirty} onClick={() => { setDirty(false); setError(null); }}>Revert</button>
            <button class="act" disabled={!text.trim()} onClick={exportFile}>Save as file…</button>
            <label class="file">Load file…<input type="file" accept=".json,application/json" onChange={(e) => void importFile((e.target as HTMLInputElement).files?.[0])} /></label>
          </div>
          <p class="muted">
            Each group takes a roster section (<code>rosterGroup</code>: column_heads, associate_editors, columnists or leadership) and any <code>names</code> as MC lists them ("Editor, Pat"), which win over sections. Styles: <code>color</code>, <code>bold</code>, <code>italic</code>; menu-wide <code>fontSize</code>, <code>fontFamily</code> and <code>sort</code> ("mc", "name" or "load").
          </p>
        </>
      )}
      {store.source === 'server' && <pre>{pretty(store.server)}</pre>}
      {error && <p class="warn">{error}</p>}
    </>
  );
}
