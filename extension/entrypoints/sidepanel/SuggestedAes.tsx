// "Suggested AEs" on the side panel's Page tab: the AEs whose published work
// is closest to the manuscript in this tab, with their current load. The
// manuscript's title, abstract and keywords are embedded on this computer
// (lib/embed.ts), compared with the profiles loaded from ae-profiles.json
// (lib/match.ts), and then dropped: neither text nor vector is kept.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { KEY } from '../../lib/messages';
import { manuscriptText, parseProfiles, rankAes, splitKeywords, type AeMatch, type AeProfilesFile } from '../../lib/match';
import { embed, modelBundled } from '../../lib/embed';
import { journalKey, matchPerson, type AeLoad } from '../../lib/aeload';
import { latestJournal } from '../../lib/matrix';
import type { ManuscriptDetails } from '../../parsers/types';

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

const SHOWN = 8;

type State = { kind: 'idle' } | { kind: 'working'; note: string } | { kind: 'done'; matches: AeMatch[]; usedAbstract: boolean } | { kind: 'error'; message: string };

export function SuggestedAes({ manuscript, tabId, pageUrl }: { manuscript: ManuscriptDetails; tabId?: number; pageUrl: string }) {
  const file = useLocal<AeProfilesFile | null>(KEY.aeProfiles, null);
  const loads = useLocal<Record<string, AeLoad>>(KEY.aeLoad, {});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [all, setAll] = useState(false);

  const profiles = useMemo(() => {
    if (!file) return null;
    try {
      return parseProfiles(file);
    } catch (e) {
      return e as Error;
    }
  }, [file]);

  // Current load per profile id, from MC's AE pull-down for this journal.
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    if (!profiles || profiles instanceof Error) return out;
    const load = loads[journalKey(pageUrl)] ?? loads[latestJournal(loads) ?? ''];
    for (const e of load?.entries ?? []) {
      const p = matchPerson(e.name, profiles.people);
      if (p) out.set(p.id, (out.get(p.id) ?? 0) + e.count);
    }
    return out;
  }, [profiles, loads, pageUrl]);

  useEffect(() => {
    if (!profiles || profiles instanceof Error || !manuscript.title) return;
    let live = true;
    void (async () => {
      try {
        if (!(await modelBundled())) {
          setState({ kind: 'error', message: 'This build has no embedding model (it was built with SKIP_MODEL). Rebuild with npm run build.' });
          return;
        }
        setState({ kind: 'working', note: 'Reading the abstract…' });
        const page = tabId === undefined
          ? {}
          : ((await chrome.tabs.sendMessage(tabId, { type: 'abstract' }, { frameId: 0 }).catch(() => ({}))) as { abstract?: string; keywords?: string });
        const keywords = splitKeywords(page.keywords);
        if (!live) return;
        setState({ kind: 'working', note: 'Comparing with AE profiles on this computer…' });
        const vec = await embed(manuscriptText(manuscript.title, page.abstract, keywords));
        if (!live) return;
        setState({ kind: 'done', matches: rankAes(vec, profiles.people, keywords), usedAbstract: !!page.abstract });
      } catch (e) {
        if (live) setState({ kind: 'error', message: `Couldn't compute suggestions: ${(e as Error).message}` });
      }
    })();
    return () => {
      live = false;
    };
  }, [profiles, manuscript.id, manuscript.title, tabId]);

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const json = JSON.parse(await f.text()) as AeProfilesFile;
      parseProfiles(json);
      await chrome.storage.local.set({ [KEY.aeProfiles]: json });
      setLoadError(null);
    } catch (e) {
      setLoadError(`Couldn't load ${f.name}: ${(e as Error).message}`);
    }
  };
  const picker = (label: string) => (
    <label class="file act">
      {label}
      <input type="file" accept=".json,application/json" onChange={(e) => void loadFile((e.target as HTMLInputElement).files?.[0])} />
    </label>
  );

  if (!profiles || profiles instanceof Error) {
    return (
      <section>
        <h2>Suggested AEs</h2>
        <p class="muted">
          {profiles instanceof Error ? profiles.message : 'Load the AE expertise profiles to see which AEs best fit this manuscript.'} Build them with{' '}
          <code>make ae-profiles</code> (see extension/tools/ae-profiles/README.md). They stay in this browser.
        </p>
        {picker('Load AE profiles…')}
        {loadError && <p class="warn">{loadError}</p>}
      </section>
    );
  }
  if (!manuscript.title) return null;

  const shown = state.kind === 'done' ? (all ? state.matches : state.matches.slice(0, SHOWN)) : [];
  const top = state.kind === 'done' ? state.matches[0]?.score ?? 1 : 1;
  return (
    <section class="suggest">
      <h2>Suggested AEs</h2>
      {state.kind === 'working' && <p class="muted">{state.note}</p>}
      {state.kind === 'error' && <p class="warn">{state.message}</p>}
      {state.kind === 'done' && (
        <>
          {!state.usedAbstract && <p class="muted">No abstract on this page, so this is from the title alone. Open the page that shows the abstract for a better match.</p>}
          <table>
            {shown.map((m) => (
              <tr>
                <td>
                  <b>{m.name}</b>
                  {counts.has(m.id) && <span class="muted"> · {counts.get(m.id)} now</span>}
                  {m.keywordScore > 0 && <span class="muted"> · keywords {Math.round(m.keywordScore * 100)}%</span>}
                  {m.closest && <div class="muted closest">closest: {m.closest.title}{m.closest.year ? ` (${m.closest.year})` : ''}</div>}
                </td>
                <td class="score" title={`overall ${m.score.toFixed(3)}, profile ${m.meanSim.toFixed(3)}, best paper ${m.bestSim.toFixed(3)}`}>
                  <span class="bar" style={`width:${Math.max(4, Math.round((m.score / top) * 60))}px`} />
                  {m.score.toFixed(2)}
                </td>
              </tr>
            ))}
          </table>
          {state.matches.length > SHOWN && (
            <button class="act" onClick={() => setAll(!all)}>{all ? `Top ${SHOWN} only` : `All ${state.matches.length}`}</button>
          )}
        </>
      )}
      <p class="muted">
        Computed on this computer; the manuscript isn't stored or sent. Profiles built {profiles.builtAt.slice(0, 10)} ({profiles.people.length} AEs). {picker('Load newer…')}
      </p>
      {loadError && <p class="warn">{loadError}</p>}
    </section>
  );
}
