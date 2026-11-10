// The team as a tree of pills (lib/team.ts): the EIC and Deputy EIC side by
// side, the co-chairs, then a card per section with its heads, its AEs and
// the columns inside it with their columnists, then the columns that report
// to the co-chairs, the AEs in no section, and (when editing) the people on
// no part of the tree. An AE in several sections appears in each. Clicking a
// pill calls onPerson. With onChange it is the hierarchy editor: pills get
// an ×, each list a + picker, and sections and columns can be added,
// renamed, moved between sections and removed.

import type { ComponentChildren } from 'preact';
import { LEADER_LABEL, fullName, newId, unassignedAes, unplaced, type LeaderRole, type Team, type TeamColumn, type TeamSection } from '../lib/team';
import './team.css';

interface Props {
  team: Team;
  onPerson: (id: string) => void;
  /** Editing: the changed team. */
  onChange?: (team: Team) => void;
  /** Bold brown text after a pill, such as a current assignment count. */
  extra?: (id: string) => ComponentChildren;
  /** Viewing only: leave out the columns and their columnists (they take no assignments). */
  hideColumns?: boolean;
}

export function TeamTree({ team, onPerson, onChange, extra, hideColumns }: Props) {
  const edit = !!onChange;
  const columns = edit || !hideColumns;
  const byId = new Map(team.people.map((p) => [p.id, p]));
  const people = [...team.people].sort((a, b) => a.family.localeCompare(b.family) || a.given.localeCompare(b.given));
  const change = (f: (t: Team) => Team) => onChange?.(f(structuredClone(team)));

  const pill = (id: string, kind: string, remove?: () => void) => {
    const p = byId.get(id);
    if (!p) return null;
    return (
      <span class={`pill ${kind}${p.shared ? ' shared' : ''}`} onClick={() => onPerson(id)} title={p.email ?? ''}>
        {fullName(p)}
        {extra?.(id)}
        {edit && remove && <button class="x" title="Take off this list" onClick={(e) => { e.stopPropagation(); remove(); }}>×</button>}
      </span>
    );
  };
  /** A + picker of everyone not already on the list. */
  const adder = (have: string[], add: (id: string) => void, title = '+ add') =>
    edit && (
      <select class="add-pill" value="" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) add(v); }}>
        <option value="">{title}</option>
        {people.filter((p) => !have.includes(p.id)).map((p) => <option value={p.id}>{fullName(p)}</option>)}
      </select>
    );

  const leaders = (roles: LeaderRole[]) => team.leaders.filter((l) => roles.includes(l.role));
  const removeLeader = (person: string, role: LeaderRole) => change((t) => ({ ...t, leaders: t.leaders.filter((l) => !(l.person === person && l.role === role)) }));
  const addLeader = (person: string, role: LeaderRole) => change((t) => ({ ...t, leaders: [...t.leaders, { person, role }] }));
  const setSection = (id: string, f: (s: TeamSection) => TeamSection) => change((t) => ({ ...t, sections: t.sections.map((s) => (s.id === id ? f(s) : s)) }));
  const setColumn = (id: string, f: (c: TeamColumn) => TeamColumn) => change((t) => ({ ...t, columns: t.columns.map((c) => (c.id === id ? f(c) : c)) }));
  const addColumn = (section?: string) =>
    change((t) => ({ ...t, columns: [...t.columns, { id: newId('c', 'new column', t.columns.map((c) => c.id)), name: 'New column', columnists: [], ...(section ? { section } : {}) }] }));

  const column = (c: TeamColumn) => (
    <div class="tree-sub tree-column">
      <span class="tree-title">
        {edit ? (
          <>
            <input value={c.name} onChange={(e) => setColumn(c.id, (x) => ({ ...x, name: (e.target as HTMLInputElement).value.trim() || x.name }))} />{' '}
            <select value={c.section ?? ''} title="Who its columnists report to" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setColumn(c.id, ({ section: _s, ...x }) => (v ? { ...x, section: v } : x)); }}>
              <option value="">reports to the co-chairs</option>
              {team.sections.map((s) => <option value={s.id}>in {s.name}</option>)}
            </select>{' '}
            <button class="x" title="Remove this column" onClick={() => window.confirm(`Remove the ${c.name} column?`) && change((t) => ({ ...t, columns: t.columns.filter((x) => x.id !== c.id) }))}>×</button>
          </>
        ) : <>{c.name} column</>}
      </span>
      {c.columnists.map((id) => pill(id, '', () => setColumn(c.id, (x) => ({ ...x, columnists: x.columnists.filter((y) => y !== id) }))))}
      {!c.columnists.length && !edit && <span class="tree-empty">no columnists</span>}
      {adder(c.columnists, (id) => setColumn(c.id, (x) => ({ ...x, columnists: [...x.columnists, id] })), '+ columnist')}
    </div>
  );

  const loose = team.columns.filter((c) => !c.section);
  const freeAes = unassignedAes(team);
  const nowhere = unplaced(team);

  return (
    <div class="tree">
      <div class="tree-row">
        {(['eic', 'deputy-eic'] as LeaderRole[]).map((role) => (
          <div class="tree-level">
            <span class="tree-title">{LEADER_LABEL[role]}</span>
            {leaders([role]).map((l) => pill(l.person, 'leader', () => removeLeader(l.person, role)))}
            {!leaders([role]).length && !edit && <span class="tree-empty">none</span>}
            {adder(leaders([role]).map((l) => l.person), (id) => addLeader(id, role))}
          </div>
        ))}
      </div>
      <div class="tree-level">
        <span class="tree-title">Co-Chairs</span>
        {leaders(['co-chair']).map((l) => pill(l.person, 'leader', () => removeLeader(l.person, 'co-chair')))}
        {!leaders(['co-chair']).length && !edit && <span class="tree-empty">none</span>}
        {adder(leaders(['co-chair']).map((l) => l.person), (id) => addLeader(id, 'co-chair'))}
      </div>

      <div class="tree-cards">
        {team.sections.map((s) => (
          <div class="tree-card">
            <h3>
              {edit ? <input value={s.name} onChange={(e) => setSection(s.id, (x) => ({ ...x, name: (e.target as HTMLInputElement).value.trim() || x.name }))} /> : s.name}
              {edit && <button class="x" title="Remove this section" onClick={() => window.confirm(`Remove the ${s.name} section? Its columns will report to the co-chairs.`) && change((t) => ({ ...t, sections: t.sections.filter((x) => x.id !== s.id), columns: t.columns.map(({ section, ...c }) => (section === s.id ? c : { ...c, ...(section ? { section } : {}) })) }))}>×</button>}
            </h3>
            <div class="tree-sub">
              <span class="tree-title">{s.heads.length === 1 ? 'Head' : 'Heads'}</span>
              {s.heads.map((id) => pill(id, 'head', () => setSection(s.id, (x) => ({ ...x, heads: x.heads.filter((y) => y !== id) }))))}
              {!s.heads.length && !edit && <span class="tree-empty">no head</span>}
              {adder(s.heads, (id) => setSection(s.id, (x) => ({ ...x, heads: [...x.heads, id] })), '+ head')}
            </div>
            <div class="tree-sub">
              <span class="tree-title">AEs</span>
              {s.aes.map((id) => pill(id, '', () => setSection(s.id, (x) => ({ ...x, aes: x.aes.filter((y) => y !== id) }))))}
              {!s.aes.length && !edit && <span class="tree-empty">none yet</span>}
              {adder(s.aes, (id) => change((t) => ({ ...t, sections: t.sections.map((x) => (x.id === s.id ? { ...x, aes: [...x.aes, id] } : x)), people: t.people.map((x) => (x.id === id ? { ...x, ae: true } : x)) })), '+ AE')}
            </div>
            {columns && team.columns.filter((c) => c.section === s.id).map(column)}
            {edit && <div><button onClick={() => addColumn(s.id)}>+ column in {s.name}</button></div>}
          </div>
        ))}
        {edit && (
          <div class="tree-card">
            <button onClick={() => change((t) => ({ ...t, sections: [...t.sections, { id: newId('s', 'new section', t.sections.map((x) => x.id)), name: 'New section', heads: [], aes: [] }] }))}>+ section</button>
          </div>
        )}
      </div>

      {columns && (loose.length > 0 || edit) && (
        <div class="tree-card">
          <h3>Columns that report to the co-chairs</h3>
          {loose.map(column)}
          {edit && <div><button onClick={() => addColumn()}>+ column</button></div>}
        </div>
      )}
      {(freeAes.length > 0 || edit) && (
        <div class="tree-level">
          <span class="tree-title">AEs in no section</span>
          {freeAes.map((p) => pill(p.id, '', () => change((t) => ({ ...t, people: t.people.map((x) => (x.id === p.id ? { ...x, ae: undefined } : x)) }))))}
          {!freeAes.length && <span class="tree-empty">none</span>}
          {adder(freeAes.map((p) => p.id), (id) => change((t) => ({ ...t, people: t.people.map((x) => (x.id === id ? { ...x, ae: true } : x)) })), '+ AE')}
        </div>
      )}
      {edit && nowhere.length > 0 && (
        <div class="tree-level">
          <span class="tree-title">Not on the tree</span>
          {nowhere.map((p) => pill(p.id, ''))}
        </div>
      )}
    </div>
  );
}
