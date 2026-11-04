// The AE menu config editor, in its own window (opened from the side panel).
// It edits this browser's AE menu config (lib/aemenu.ts): which parts of the
// team database (lib/team.ts) each group takes, the dividers and their
// styles, how people are labeled, and the menu's font and order. People and
// the hierarchy are edited in the team window, not here. It loads and saves
// the config as a JSON file, starts over from the config shipped with the
// extension, previews the result on a copy of the last AE pull-down MC
// showed, and has the planned server store's buttons (list, download, and
// for the admin save and delete), which say they aren't built yet.

import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  applyAeMenu,
  defaultAeMenu,
  deleteServerConfig,
  getServerConfig,
  groupCounts,
  labelFor,
  listServerConfigs,
  parseAeMenu,
  TEAM_PARTS,
  saveServerConfig,
  type AeMenuConfig,
  type AeMenuGroup,
  type AeMenuStore,
  type ServerConfigInfo,
} from '../../lib/aemenu';
import type { AeLoad } from '../../lib/aeload';
import { latestJournal } from '../../lib/matrix';
import { KEY, getSettings } from '../../lib/messages';
import { placementOf, sectionLabel, unassignedAes, type Team } from '../../lib/team';
import { openTeamEditor } from '../../lib/windows';

function useLocal<T>(key: string, fallback: T): T {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => {
    void chrome.storage.local.get(key).then((g) => setV((g[key] as T) ?? fallback));
    const on = (ch: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && key in ch) setV((ch[key]?.newValue as T) ?? fallback);
    };
    chrome.storage.onChanged.addListener(on);
    return () => chrome.storage.onChanged.removeListener(on);
  }, [key]);
  return v;
}

async function saveStore(change: (s: AeMenuStore) => AeMenuStore): Promise<void> {
  const now = ((await chrome.storage.local.get(KEY.aeMenu))[KEY.aeMenu] as AeMenuStore | undefined) ?? { source: 'local' };
  await chrome.storage.local.set({ [KEY.aeMenu]: change(now) });
}

const val = (e: Event) => (e.target as HTMLInputElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;

function App() {
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<AeMenuConfig>(defaultAeMenu());
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [json, setJson] = useState<string | null>(null);
  const [server, setServer] = useState('');
  const [list, setList] = useState<ServerConfigInfo[] | null>(null);
  const team = useLocal<Team | null>(KEY.team, null);
  const loads = useLocal<Record<string, AeLoad>>(KEY.aeLoad, {});

  const reload = async () => {
    const store = (await chrome.storage.local.get(KEY.aeMenu))[KEY.aeMenu] as AeMenuStore | undefined;
    setDraft(store?.local ?? defaultAeMenu());
    setDirty(false);
    setError(null);
    setLoaded(true);
  };
  useEffect(() => {
    void reload();
    void getSettings().then((s) => setServer(s.notesServer));
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (change: (c: AeMenuConfig) => AeMenuConfig) => {
    setDraft((c) => change(structuredClone(c)));
    setDirty(true);
    setStatus('');
  };
  const say = (s: string) => {
    setStatus(s);
    setError(null);
  };
  const fail = (e: unknown) => setError((e as Error).message);

  const save = async () => {
    try {
      const c = parseAeMenu(draft);
      await saveStore((s) => ({ ...s, local: c }));
      setDraft(c);
      setDirty(false);
      say('Saved in this browser. Open MC tabs update right away.');
    } catch (e) {
      fail(e);
    }
  };
  const exportFile = () => {
    try {
      const c = parseAeMenu(draft);
      const url = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2) + '\n'], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ae-menu-${(c.profile || 'config').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      fail(e);
    }
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    if (dirty && !window.confirm('Loading a file replaces your unsaved changes. Load it?')) return;
    try {
      // A loaded file is checked and used at once, like opening a document.
      const c = parseAeMenu(JSON.parse(await f.text()));
      await saveStore((st) => ({ ...st, local: c }));
      setDraft(c);
      setDirty(false);
      say(`Loaded and saved ${f.name}. Open MC tabs update right away.`);
    } catch (e) {
      setError(`${f.name}: ${e instanceof SyntaxError ? `not valid JSON (${e.message})` : (e as Error).message}`);
    }
  };
  const startBlank = () => {
    if (!window.confirm('Start over from the blank config that comes with the extension? The table will be empty.')) return;
    setDraft(defaultAeMenu());
    setDirty(true);
    say('Started from the blank config. Save to use it.');
  };

  // ---- Groups ----
  const setGroup = (i: number, g: Partial<AeMenuGroup>) => edit((c) => ({ ...c, groups: c.groups.map((x, j) => (j === i ? { ...x, ...g } : x)) }));
  const moveGroup = (i: number, d: number) =>
    edit((c) => {
      const gs = [...c.groups];
      const [g] = gs.splice(i, 1);
      gs.splice(i + d, 0, g!);
      return { ...c, groups: gs };
    });

  // ---- MC's last pull-down, for matching and the preview ----
  const journal = latestJournal(loads);
  const entries = journal ? (loads[journal]?.entries ?? []) : [];
  const names = entries.map((e) => e.name);
  const valid = useMemo(() => {
    try {
      return parseAeMenu(draft);
    } catch (e) {
      return e as Error;
    }
  }, [draft]);
  const counts = !(valid instanceof Error) && names.length ? groupCounts(names, valid, team) : null;

  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = previewRef.current;
    if (!box) return;
    box.innerHTML = '';
    if (!entries.length || valid instanceof Error) return;
    // A copy of MC's pull-down, built from the names and counts last read.
    const table = document.createElement('table');
    const row = table.insertRow();
    row.insertCell().textContent = 'Assign Associate Editor';
    const select = document.createElement('select');
    select.add(new Option('Select...', ''));
    entries.forEach((e, i) => select.add(new Option(`${e.name} (${e.count})`, String(i))));
    row.insertCell().appendChild(select);
    box.appendChild(table);
    applyAeMenu(document, valid, team);
  }, [valid, team, entries.length, journal]);

  // ---- Server (planned) ----
  const doServer = async (what: () => Promise<void>) => {
    try {
      await what();
    } catch (e) {
      fail(e);
    }
  };

  if (!loaded) return <div class="wrap"><p class="muted">Loading…</p></div>;
  const sections = (team?.sections ?? []).map((s) => s.name);
  const samplePerson = team?.people.find((p) => placementOf(team, p.id).heads.length) ?? team?.people[0];
  const sample = samplePerson && team ? { section: sectionLabel(team, samplePerson.id), given: samplePerson.given, family: samplePerson.family } : undefined;

  return (
    <div class="wrap">
      <h1>AE menu config</h1>
      <p class="muted">How MC's Assign Associate Editor pull-down is grouped, labeled and colored in this browser. MC's choices and what it submits never change.</p>
      <div class="tools">
        <button class="primary" disabled={!dirty} onClick={() => void save()}>Save</button>
        <button disabled={!dirty} onClick={() => void reload()}>Revert</button>
        <button onClick={exportFile}>Save to file…</button>
        <label class="file">Load from file…<input type="file" accept=".json,application/json" onChange={(e) => void importFile((e.target as HTMLInputElement).files?.[0])} /></label>
        <button onClick={startBlank}>Start from blank</button>
        <span class="status">{dirty ? 'Unsaved changes' : status}</span>
      </div>
      {error && <div class="error">{error}</div>}
      {valid instanceof Error && <div class="error">Not saved until fixed: {valid.message}</div>}

      <div class="row">
        <label>Config name <input value={draft.profile} onInput={(e) => edit((c) => ({ ...c, profile: val(e) }))} placeholder="Opinions co-chair" /></label>
        <label><input type="checkbox" checked={draft.enabled} onChange={(e) => edit((c) => ({ ...c, enabled: checked(e) }))} /> Use it on MC pages</label>
      </div>

      <h2>People</h2>
      <p class="muted">
        {team ? <>The menu uses the team database ({team.people.length} people, {team.sections.length} sections{unassignedAes(team).length ? `, ${unassignedAes(team).length} AEs in no section` : ''}). </> : <>No team database yet, so only names typed into the JSON are grouped. </>}
        <button onClick={() => void openTeamEditor()}>Edit the team…</button>
      </p>

      <h2>Labels</h2>
      <div class="row">
        <label style="flex:1">Show people in the team as{' '}
          <input class="wide" value={draft.label} onInput={(e) => edit((c) => ({ ...c, label: val(e) }))} placeholder="(blank keeps MC's text)" />
        </label>
      </div>
      <p class="muted">Use {'{section}'} (all their sections, "Education / Privacy"), {'{given}'}, {'{family}'} and {'{mc}'} (MC's own name). MC's count stays at the end. {sample && draft.label ? <>Example: <b>{labelFor(sample, `${sample.family}, ${sample.given}`, draft.label)} (3)</b></> : ''}</p>

      <h2>Groups, in menu order</h2>
      <datalist id="sections">{sections.map((s) => <option value={s} />)}</datalist>
      <table>
        <thead><tr><th>Divider label</th><th>Takes</th><th>Only these sections</th><th>Color</th><th>Bold</th><th>Italic</th><th>{counts ? 'In MC' : ''}</th><th /></tr></thead>
        <tbody>
          {draft.groups.map((g, i) => (
            <tr key={i}>
              <td><input value={g.label} onInput={(e) => setGroup(i, { label: val(e) })} /></td>
              <td>
                {TEAM_PARTS.map((t) => (
                  <label style="display:block;white-space:nowrap">
                    <input type="checkbox" checked={!!g.take?.includes(t.id)} onChange={(e) => setGroup(i, { take: TEAM_PARTS.map((x) => x.id).filter((x) => (x === t.id ? checked(e) : !!g.take?.includes(x))) })} /> {t.title}
                  </label>
                ))}
              </td>
              <td><input value={(g.sections ?? []).join(', ')} list="sections" placeholder="every section" onInput={(e) => setGroup(i, { sections: val(e).split(',').map((s) => s.trim()).filter(Boolean) })} /></td>
              <td class="n"><input type="color" value={g.color && /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : '#000000'} onInput={(e) => setGroup(i, { color: val(e) })} /></td>
              <td class="n"><input type="checkbox" checked={!!g.bold} onChange={(e) => setGroup(i, { bold: checked(e) })} /></td>
              <td class="n"><input type="checkbox" checked={!!g.italic} onChange={(e) => setGroup(i, { italic: checked(e) })} /></td>
              <td class="n">{counts ? counts[i] : ''}</td>
              <td class="n">
                <button disabled={i === 0} onClick={() => moveGroup(i, -1)}>↑</button>{' '}
                <button disabled={i === draft.groups.length - 1} onClick={() => moveGroup(i, 1)}>↓</button>{' '}
                <button title="Remove" onClick={() => edit((c) => ({ ...c, groups: c.groups.filter((_, j) => j !== i) }))}>✕</button>
              </td>
            </tr>
          ))}
          <tr>
            <td><input value={draft.rest.label} onInput={(e) => edit((c) => ({ ...c, rest: { ...c.rest, label: val(e) } }))} /></td>
            <td colSpan={2} class="muted">Everyone else, last</td>
            <td class="n"><input type="color" value={draft.rest.color && /^#[0-9a-f]{6}$/i.test(draft.rest.color) ? draft.rest.color : '#000000'} onInput={(e) => edit((c) => ({ ...c, rest: { ...c.rest, color: val(e) } }))} /></td>
            <td class="n"><input type="checkbox" checked={!!draft.rest.bold} onChange={(e) => edit((c) => ({ ...c, rest: { ...c.rest, bold: checked(e) } }))} /></td>
            <td class="n"><input type="checkbox" checked={!!draft.rest.italic} onChange={(e) => edit((c) => ({ ...c, rest: { ...c.rest, italic: checked(e) } }))} /></td>
            <td class="n">{counts ? counts[draft.groups.length] : ''}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div class="row">
        <button onClick={() => edit((c) => ({ ...c, groups: [...c.groups, { label: 'New group', take: [] }] }))}>Add a group</button>
        <span class="muted">A person goes in the first group that takes them; names typed into the JSON win.</span>
      </div>


      <h2>Menu</h2>
      <div class="row">
        <label>Text size <select value={String(draft.fontSize)} onChange={(e) => edit((c) => ({ ...c, fontSize: Number(val(e)) }))}>
          {[0, 11, 12, 13, 14, 15, 16, 18].map((n) => <option value={String(n)}>{n ? `${n}px` : "MC's own"}</option>)}
        </select></label>
        <label>Font <input value={draft.fontFamily} placeholder="MC's own" onInput={(e) => edit((c) => ({ ...c, fontFamily: val(e) }))} /></label>
        <label>Order in each group <select value={draft.sort} onChange={(e) => edit((c) => ({ ...c, sort: val(e) as AeMenuConfig['sort'] }))}>
          <option value="mc">MC's (alphabetical)</option>
          <option value="name">by label</option>
          <option value="load">fewest manuscripts first</option>
        </select></label>
      </div>

      <h2>Preview</h2>
      {entries.length ? <div class="preview" ref={previewRef} /> : <p class="muted">Open an Assign Associate Editor page in MC once, and the menu it showed is previewed here with this config.</p>}

      <h2>Server</h2>
      <p class="muted">Planned: configs stored on the notes server, which anyone can list and download, and which only the admin can save or delete (requests signed with the admin's key). Not built yet, so these buttons say so.</p>
      <div class="row">
        <button onClick={() => void doServer(async () => setList(await listServerConfigs(server)))}>List server configs</button>
        <button onClick={() => void doServer(async () => saveServerConfig(server, parseAeMenu(draft)))}>Save this config to the server (admin)</button>
      </div>
      {list && (
        <table>
          <thead><tr><th>Name</th><th>Saved</th><th>By</th><th>People</th><th /></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr>
                <td>{c.name}</td><td>{c.savedAt}</td><td>{c.savedBy}</td><td>{c.people}</td>
                <td class="n">
                  <button onClick={() => void doServer(async () => {
                    const got = await getServerConfig(server, c.name);
                    await saveStore((s) => ({ ...s, server: got, serverName: c.name, serverFetchedAt: new Date().toISOString() }));
                    setDraft(got);
                    setDirty(true);
                    say(`Downloaded ${c.name}. Save to keep it as this browser's config, or choose "server's config" in Settings.`);
                  })}>Download</button>{' '}
                  <button onClick={() => window.confirm(`Delete ${c.name} from the server?`) && void doServer(async () => deleteServerConfig(server, c.name))}>Delete (admin)</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details onToggle={(e) => setJson((e.target as HTMLDetailsElement).open ? JSON.stringify(draft, null, 2) : null)}>
        <summary>Edit as JSON</summary>
        {json !== null && (
          <>
            <textarea style="min-height:300px" spellcheck={false} value={json} onInput={(e) => setJson((e.target as HTMLTextAreaElement).value)} />
            <div class="row">
              <button onClick={() => {
                try {
                  setDraft(parseAeMenu(JSON.parse(json)));
                  setDirty(true);
                  say('JSON applied. Save to use it.');
                } catch (e) {
                  fail(e);
                }
              }}>Apply JSON</button>
            </div>
          </>
        )}
      </details>
    </div>
  );
}

render(<App />, document.getElementById('app')!);
