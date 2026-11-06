// "AE assignment menu" in the side panel's Settings tab: whether MC's Assign
// Associate Editor pull-down is regrouped and relabeled (lib/aemenu.ts),
// whether it follows this browser's config or the one downloaded from the
// server, copying the server's here for editing, and a button that opens
// the editor in its own window (entrypoints/aemenu).

import { useEffect, useState } from 'preact/hooks';
import { KEY } from '../../lib/messages';
import type { AeMenuStore } from '../../lib/aemenu';
import { openAeMenuEditor, openTeamEditor } from '../../lib/windows';

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

async function saveStore(change: (s: AeMenuStore) => AeMenuStore): Promise<void> {
  const now = ((await chrome.storage.local.get(KEY.aeMenu))[KEY.aeMenu] as AeMenuStore | undefined) ?? { source: 'local' };
  await chrome.storage.local.set({ [KEY.aeMenu]: change(now) });
}


export function AeMenuSettings({ flash }: { flash: (s: string) => void }) {
  const store = useLocal<AeMenuStore>(KEY.aeMenu, { source: 'local' });
  const local = store.local;
  const server = store.server;
  const used = store.source === 'server' ? server : local;

  const toggle = (on: boolean) =>
    void saveStore((s) => {
      const key = s.source === 'server' ? 'server' : 'local';
      const c = s[key];
      return c ? { ...s, [key]: { ...c, enabled: on } } : s;
    });
  const copyServer = async () => {
    if (!server) return;
    if (local && !window.confirm("Replace this browser's AE menu config with the server's copy?")) return;
    await saveStore((s) => ({ ...s, local: server, source: 'local' }));
    flash("Copied the server's config here; edit it in the editor");
  };

  return (
    <>
      <h2 style="margin-top:12px">AE assignment menu</h2>
      <label class="chk">
        <input type="checkbox" checked={!!used?.enabled} disabled={!used} onChange={(e) => toggle((e.target as HTMLInputElement).checked)} />
        Group, relabel and color the Assign Associate Editor pull-down
      </label>
      <label class="chk">
        <input type="radio" name="aemenu-source" checked={store.source !== 'server'} onChange={() => void saveStore((s) => ({ ...s, source: 'local' }))} />
        This browser's config {local ? `(${local.profile || 'unnamed'}, ${local.groups.length} groups)` : '(none yet)'}
      </label>
      <label class="chk">
        <input type="radio" name="aemenu-source" checked={store.source === 'server'} disabled={!server} onChange={() => void saveStore((s) => ({ ...s, source: 'server' }))} />
        The server's config {server ? `(${store.serverName ?? server.profile}, downloaded ${store.serverFetchedAt?.slice(0, 10) ?? ''})` : '(download one in the editor first)'}
      </label>
      <div class="note-actions" style="flex-wrap:wrap;margin:4px 0">
        <button class="act" onClick={() => void openAeMenuEditor()}>Edit the AE menu config…</button>
        <button class="act" onClick={() => void openTeamEditor()}>Edit the team…</button>
        <button class="act" disabled={!server} onClick={() => void copyServer()}>Copy the server's config here</button>
      </div>
      <p class="muted">MC's choices and what it submits don't change. People and their sections come from the team database.</p>
    </>
  );
}
