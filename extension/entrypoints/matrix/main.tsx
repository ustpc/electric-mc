// The Opinions editorial matrix, in its own window. One row per person in
// four sections, from the roster the person loaded (lib/roster.ts), with each
// editor's current assignment count read from MC's AE pull-down
// (lib/aeload.ts). Nothing here leaves the browser.

import { render, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AeLoad } from '../../lib/aeload';
import { assignedLabel, joinLoads, latestJournal } from '../../lib/matrix';
import { KEY } from '../../lib/messages';
import { GROUPS, fold, matchesSearch, parseRoster, type Roster, type RosterPerson } from '../../lib/roster';

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

/** The text with every search word marked. */
function hl(text: string, words: string[]): ComponentChildren {
  if (!words.length || !text) return text;
  const f = fold(text);
  // fold() can change lengths (ligatures); only mark when it doesn't.
  if (f.length !== text.length) return text;
  const marks: [number, number][] = [];
  for (const w of words) for (let i = f.indexOf(w); i >= 0; i = f.indexOf(w, i + 1)) marks.push([i, i + w.length]);
  if (!marks.length) return text;
  marks.sort((a, b) => a[0] - b[0]);
  const out: ComponentChildren[] = [];
  let at = 0;
  for (const [s, e] of marks) {
    if (e <= at) continue;
    const from = Math.max(s, at);
    if (from > at) out.push(text.slice(at, from));
    out.push(<mark>{text.slice(from, e)}</mark>);
    at = e;
  }
  out.push(text.slice(at));
  return out;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

function App() {
  const roster = useLocal<Roster | null>(KEY.roster, null);
  const loads = useLocal<Record<string, AeLoad>>(KEY.aeLoad, {});
  const [journal, setJournal] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const journals = Object.keys(loads);
  const shown = journal && loads[journal] ? journal : latestJournal(loads);
  const load = shown ? loads[shown] : undefined;
  const people = roster?.people ?? [];
  const joined = useMemo(() => joinLoads(people, load?.entries ?? []), [roster, load]);
  const words = fold(query).split(/\s+/).filter(Boolean);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = parseRoster(JSON.parse(await file.text()));
      await chrome.storage.local.set({ [KEY.roster]: r });
      setError(null);
    } catch (e) {
      setError(`Couldn't load ${file.name}: ${(e as Error).message}`);
    }
  };

  const countOf = (p: RosterPerson) => joined.counts.get(p.id);
  const badge = (p: RosterPerson) => {
    const n = countOf(p);
    if (n !== undefined) return <span class="load">{assignedLabel(n)}</span>;
    return p.assignable && load ? <span class="load none" title="Not in MC's AE pull-down">not in MC's list</span> : null;
  };
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <div class="wrap">
      <div class="heading">
        <h1>{roster ? `${roster.section} editorial matrix` : 'Editorial matrix'}</h1>
        {roster && <p class="date">{people.length} people · Researched {roster.researchedOn}</p>}
      </div>
      <div class="tools">
        <input type="search" placeholder="Name, institution, role, column, or expertise…" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
        <button onClick={() => setQuery('')} disabled={!query}>Clear</button>
        {journals.length > 1 && (
          <label class="muted">Counts from{' '}
            <select value={shown} onChange={(e) => setJournal((e.target as HTMLSelectElement).value)}>
              {journals.map((j) => <option value={j}>{j}</option>)}
            </select>
          </label>
        )}
        <label class="file">{roster ? 'Load a newer roster…' : 'Load roster…'}<input type="file" accept=".json,application/json" onChange={(e) => void loadFile((e.target as HTMLInputElement).files?.[0])} /></label>
      </div>
      <p class="loads">
        {load
          ? <>Assignment counts from MC's AE pull-down on {load.journal}, read {when(load.at)}. They update each time you open that pull-down in MC.</>
          : <>No assignment counts yet. Open the Assign Associate Editor pull-down on any manuscript in MC, and the counts appear here.</>}
      </p>
      {error && <p class="error">{error}</p>}
      {!roster && (
        <div class="intro">
          <p>Load the Opinions roster to see the full matrix. In your cacm-opn-dashboard checkout, run <code>make export</code>, then press <b>Load roster…</b> and choose the <code>roster.json</code> it writes. The roster stays in this browser only.</p>
        </div>
      )}
      {roster && GROUPS.map((g) => {
        const members = people.filter((p) => p.group === g.id);
        const visible = members.filter((p) => matchesSearch(p, query, countOf(p) !== undefined ? assignedLabel(countOf(p)!) : ''));
        if (!members.length) return null;
        const total = members.reduce((n, p) => n + (countOf(p) ?? 0), 0);
        return (
          <section class="group">
            <div class="group-heading">
              <h2>{g.title}</h2>
              <span class="count">{query ? `${visible.length} of ${members.length}` : members.length}</span>
              {load && total > 0 && <span class="sum">{assignedLabel(total)}</span>}
            </div>
            {visible.length === 0 ? <p class="muted">No people in this section match the search.</p> : (
              <table>
                <colgroup><col class="person" /><col class="role" /><col class="institution" /><col class="expertise" /></colgroup>
                <thead><tr><th>Person &amp; profiles</th><th>Roles &amp; columns</th><th>Institutions</th><th>Expertise &amp; notes</th></tr></thead>
                <tbody>
                  {visible.map((p) => (
                    <tr id={p.id}>
                      <th scope="row">
                        <div class="identity">
                          {p.portrait ? <img class="portrait" src={p.portrait} alt={`Portrait of ${p.name}`} width={48} height={48} loading="lazy" /> : <div class="placeholder" aria-hidden="true">{p.initials}</div>}
                          <div>
                            <p class="person-name">{hl(p.name, words)}{badge(p)}</p>
                            <div class="links">
                              {p.homepage && <a href={p.homepage} target="_blank" rel="noopener">Homepage</a>}
                              {p.acmDl && <a href={p.acmDl} target="_blank" rel="noopener">ACM DL</a>}
                              {p.linkedin && <a href={p.linkedin} target="_blank" rel="noopener">LinkedIn</a>}
                              {p.email && <a href={`mailto:${p.email}`} title={p.email}>Email</a>}
                            </div>
                          </div>
                        </div>
                      </th>
                      <td>
                        {p.roles.map((r) => <span class="role">{hl(r, words)}</span>)}
                        {p.coheads.map((id) => byId.get(id)).filter(Boolean).map((c) => (
                          <span class="detail">Co-head: <a href={`#${c!.id}`}>{c!.name}</a>{countOf(c!) !== undefined && <span class="load">{assignedLabel(countOf(c!)!)}</span>}</span>
                        ))}
                      </td>
                      <td>
                        {p.affiliations.length ? p.affiliations.map((a) => <div>{hl(a, words)}</div>) : <span class="muted">Not verified</span>}
                        {p.mastheadAffiliation && <span class={`detail${p.affiliationMismatch ? ' mismatch' : ''}`} title={p.affiliationMismatch ? 'Differs from the current affiliation' : undefined}>Masthead: {hl(p.mastheadAffiliation, words)}</span>}
                      </td>
                      <td class="exp">
                        <p class="expertise">{hl(p.expertise, words)}</p>
                        {p.notes && <p class="notes">{hl(p.notes, words)}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      {load && (joined.unmatched.length > 0 || !roster) && (
        <section class="group">
          <div class="group-heading">
            <h2>{roster ? 'In MC but not in the roster' : 'Editors in MC'}</h2>
            <span class="count">{(roster ? joined.unmatched : load.entries).length}</span>
          </div>
          <table class="unmatched">
            <thead><tr><th>Editor in MC</th><th>Currently assigned</th></tr></thead>
            <tbody>
              {(roster ? joined.unmatched : load.entries).filter((e) => !words.length || words.every((w) => fold(e.name).includes(w))).map((e) => (
                <tr><td>{hl(e.name, words)}</td><td><span class="load">{assignedLabel(e.count)}</span></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {roster && (
        <p class="muted">
          Roster exported {roster.exportedAt ? when(roster.exportedAt) : 'at an unknown time'}.{' '}
          {roster.mastheadSource && <a href={roster.mastheadSource} target="_blank" rel="noopener">Official CACM masthead</a>}
        </p>
      )}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
