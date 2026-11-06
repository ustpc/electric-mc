// The team window: edits the hierarchy in the team database (lib/team.ts).
// The tree of pills (components/TeamTree.tsx) is editable here: leaders,
// sections with their heads and AEs, columns and who they report to. A
// pill opens the person form (components/PersonForm.tsx); "+ person" adds
// someone. Changes are kept as a draft until Save, which stores the team
// and the roster derived from it, so the Matrix, the AE menu and Suggested
// AEs all update. It loads and saves the team as a JSON file (loading also
// takes an older roster.json and converts it) and saves at once on load.
// Nothing here leaves the browser.

import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { newId, parseTeam, removePerson, type Team, type TeamPerson } from '../../lib/team';
import { currentTeam, storeTeam, teamFromFile } from '../../lib/teamStore';
import { openMatrix } from '../../lib/windows';
import { TeamTree } from '../../components/TeamTree';
import { PersonForm } from '../../components/PersonForm';

function App() {
  const [team, setTeam] = useState<Team | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ person: TeamPerson; isNew: boolean } | null>(null);

  const reload = async () => {
    setTeam(await currentTeam());
    setDirty(false);
    setError(null);
  };
  useEffect(() => void reload(), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => dirty && e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!team) return <div class="wrap"><p class="muted">Loading…</p></div>;
  const change = (t: Team) => {
    setTeam(t);
    setDirty(true);
    setStatus('');
  };
  const say = (s: string) => {
    setStatus(s);
    setError(null);
  };
  const save = async () => {
    try {
      await storeTeam(team);
      setDirty(false);
      say('Saved. The Matrix and the AE menu use it now.');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(parseTeam(team), null, 1) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-${(team.name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    if (dirty && !window.confirm('Loading a file replaces your unsaved changes. Load it?')) return;
    try {
      const t = teamFromFile(JSON.parse(await f.text()));
      await storeTeam(t);
      await reload();
      say(`Loaded and saved ${f.name}.`);
    } catch (e) {
      setError(`${f.name}: ${e instanceof SyntaxError ? `not valid JSON (${e.message})` : (e as Error).message}`);
    }
  };
  const person = (id: string) => {
    const p = team.people.find((x) => x.id === id);
    if (p) setEditing({ person: p, isNew: false });
  };

  return (
    <div class="wrap">
      <h1>Team</h1>
      <p class="muted">Who is on the team and how it's organized. The Matrix shows it, the AE menu labels and groups by it. Click a person to edit their details.</p>
      <div class="tools">
        <button class="primary" disabled={!dirty} onClick={() => void save()}>Save</button>
        <button disabled={!dirty} onClick={() => void reload()}>Revert</button>
        <button onClick={() => setEditing({ person: { id: '', given: '', family: '', affiliations: [], expertise: '', links: [] }, isNew: true })}>+ person</button>
        <button onClick={exportFile}>Save to file…</button>
        <label class="file">Load from file…<input type="file" accept=".json,application/json" onChange={(e) => void importFile((e.target as HTMLInputElement).files?.[0])} /></label>
        <button onClick={() => void openMatrix()}>Matrix</button>
        <span class="status">{dirty ? 'Unsaved changes' : status}</span>
      </div>
      {error && <div class="error">{error}</div>}
      <div class="row">
        <label>Name <input value={team.name} placeholder="Opinions" onInput={(e) => change({ ...team, name: (e.target as HTMLInputElement).value })} /></label>
        <span class="muted">{team.people.length} people · {team.sections.length} sections · {team.columns.length} columns</span>
      </div>
      <TeamTree team={team} onPerson={person} onChange={change} />
      {editing && (
        <PersonForm
          person={editing.person}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            const id = editing.isNew ? newId('p', `${p.given} ${p.family}`, team.people.map((x) => x.id)) : p.id;
            const next = { ...p, id };
            change({ ...team, people: editing.isNew ? [...team.people, next] : team.people.map((x) => (x.id === id ? next : x)) });
            setEditing(null);
          }}
          onDelete={editing.isNew ? undefined : () => {
            change(removePerson(team, editing.person.id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
