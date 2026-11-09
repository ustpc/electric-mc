// The form for one person in the team database (lib/team.ts), as a dialog
// over the Matrix or team window: names, their MC account email (one per
// person, as MC has), whether it's a shared account, whether they take AE
// assignments, affiliations, expertise, notes, any number of labeled links
// (+ adds one), and a photo, which is shrunk to 256px here before it's kept.
// Saving hands the checked person back; the caller stores the team.

import { useState } from 'preact/hooks';
import { fullName, parseTeam, type TeamLink, type TeamPerson } from '../lib/team';
import './team.css';

/** A photo file as a JPEG data URL at most `max` pixels a side. */
export async function shrinkPhoto(file: File, max = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const val = (e: Event) => (e.target as HTMLInputElement).value;

export function PersonForm({ person, isNew, onSave, onDelete, onClose }: {
  person: TeamPerson;
  isNew: boolean;
  onSave: (p: TeamPerson) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [p, setP] = useState<TeamPerson>(structuredClone(person));
  const [error, setError] = useState<string | null>(null);
  const set = (x: Partial<TeamPerson>) => setP((o) => ({ ...o, ...x }));
  const setLink = (i: number, l: Partial<TeamLink>) => set({ links: p.links.map((x, j) => (j === i ? { ...x, ...l } : x)) });

  const save = async () => {
    try {
      // Check the person the same way a loaded file is checked.
      const links = p.links.filter((l) => l.url.trim());
      const checked = parseTeam({ format: 'electric-mc-team', version: 1, people: [{ ...p, id: p.id || 'new', links }] }).people[0]!;
      await onSave({ ...checked, id: p.id });
    } catch (e) {
      setError((e as Error).message.replace(/^people\[0\]\./, ''));
    }
  };
  const photo = async (f: File | undefined) => {
    if (!f) return;
    try {
      set({ portrait: await shrinkPhoto(f) });
    } catch {
      setError(`${f.name} isn't an image this browser can read.`);
    }
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-label={isNew ? 'New person' : `Edit ${fullName(person)}`}>
        <h2>{isNew ? 'New person' : fullName(person)}</h2>
        <div class="form-grid">
          <label>Given name</label>
          <input value={p.given} onInput={(e) => set({ given: val(e) })} />
          <label>Family name</label>
          <input value={p.family} onInput={(e) => set({ family: val(e) })} />
          <label>MC account email</label>
          <input type="email" value={p.email ?? ''} placeholder="the address of their MC account" onInput={(e) => set({ email: val(e) || undefined })} />
          <label />
          <div>
            <label><input type="checkbox" checked={!!p.shared} onChange={(e) => set({ shared: (e.target as HTMLInputElement).checked || undefined })} /> Shared account (such as the co-chairs')</label>{' '}
            <label><input type="checkbox" checked={!!p.ae} onChange={(e) => set({ ae: (e.target as HTMLInputElement).checked || undefined })} /> Takes AE assignments</label>
          </div>
          <label>Name in MC, if not theirs</label>
          <input value={p.mcName ?? ''} placeholder='a role account, such as "Co-Chair, Opinions"' onInput={(e) => set({ mcName: val(e) || undefined })} />
          <label>Title in the AE menu</label>
          <input value={p.menuTitle ?? ''} placeholder="blank: their sections" onInput={(e) => set({ menuTitle: val(e) || undefined })} />
          <label />
          <div>
            <label><input type="checkbox" checked={!!p.menuTop} onChange={(e) => set({ menuTop: (e.target as HTMLInputElement).checked || undefined })} /> Always at the top of the AE menu</label>
          </div>
          <label>Photo</label>
          <div class="form-photo">
            {p.portrait ? <img src={p.portrait} alt="" /> : <div class="placeholder">{(p.given[0] ?? '') + (p.family[0] ?? '')}</div>}
            <label class="file">Upload…<input type="file" accept="image/*" onChange={(e) => void photo((e.target as HTMLInputElement).files?.[0])} /></label>
            {p.portrait && <button onClick={() => set({ portrait: undefined })}>Remove</button>}
          </div>
          <label>Affiliations (one per line)</label>
          <textarea value={p.affiliations.join('\n')} onInput={(e) => set({ affiliations: (e.target as HTMLTextAreaElement).value.split('\n') })} />
          <label>Masthead affiliation</label>
          <input value={p.mastheadAffiliation ?? ''} onInput={(e) => set({ mastheadAffiliation: val(e) || undefined })} />
          <label>Expertise</label>
          <textarea value={p.expertise} onInput={(e) => set({ expertise: (e.target as HTMLTextAreaElement).value })} />
          <label>Notes</label>
          <textarea value={p.notes ?? ''} onInput={(e) => set({ notes: (e.target as HTMLTextAreaElement).value || undefined })} />
          <label>Links</label>
          <div class="form-links">
            {p.links.map((l, i) => (
              <div>
                <input value={l.label} placeholder="Homepage" onInput={(e) => setLink(i, { label: val(e) })} />
                <input value={l.url} placeholder="https://…" onInput={(e) => setLink(i, { url: val(e) })} />
                <button title="Remove this link" onClick={() => set({ links: p.links.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <div><button title="Add a link" onClick={() => set({ links: [...p.links, { label: '', url: '' }] })}>+</button></div>
          </div>
        </div>
        {error && <p class="form-error">{error}</p>}
        <div class="form-actions">
          <button class="primary" onClick={() => void save()}>{isNew ? 'Add' : 'Save'}</button>
          <button onClick={onClose}>Cancel</button>
          <span class="grow" />
          {onDelete && <button onClick={() => window.confirm(`Remove ${fullName(person)} from the team, everywhere they appear?`) && void onDelete()}>Remove from team</button>}
        </div>
      </div>
    </div>
  );
}
