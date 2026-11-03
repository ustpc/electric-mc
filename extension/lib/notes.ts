// Notes on a manuscript. Each note has an author and the time its editing
// session began: typing keeps updating one note, and coming back after an
// hour away starts a new one. Authors can edit and delete their own notes;
// co-chairs and the EIC can delete anyone's. The server enforces the same
// rules (backend/notes). Notes are kept by base manuscript ID, since a
// revision is the same paper.

import type { KnownRoles } from './roles';

export interface Note {
  /** Base manuscript ID. */
  m: string;
  /** Start of the editing session, seconds since 1970 (time_t). */
  t: number;
  /** The author's MC email: who they are. */
  email: string;
  /** How the author is shown ("Pat Example (Opinions Co-Chair)"). */
  author: string;
  text: string;
  /** Last edit, seconds since 1970. */
  updated: number;
  /** The signing key the server last accepted this note from. */
  keyId?: string;
  /** True once the server has this version of the note. */
  synced?: boolean;
}

export type NotesStore = Record<string, Note[]>;

/** An hour away from a manuscript's notes starts a new editing session. */
export const SESSION_GAP_S = 3600;

export function nowS(): number {
  return Math.floor(Date.now() / 1000);
}

const same = (a: Pick<Note, 't' | 'email'>, b: Pick<Note, 't' | 'email'>) => a.t === b.t && a.email === b.email;

/**
 * The note this editing session writes to: the person's newest note, if
 * they edited it within the last hour; otherwise null, and the next edit
 * starts a new note stamped with that moment.
 */
export function sessionNote(list: Note[], email: string, now: number): Note | null {
  const mine = list.filter((n) => n.email === email).sort((a, b) => b.t - a.t)[0];
  return mine && now - mine.updated < SESSION_GAP_S ? mine : null;
}

/** The list with one note added or replaced (same session and author), oldest first. */
export function upsertNote(list: Note[], note: Note): Note[] {
  return [...list.filter((n) => !same(n, note)), note].sort((a, b) => a.t - b.t || a.email.localeCompare(b.email));
}

export function removeNote(list: Note[], t: number, email: string): Note[] {
  return list.filter((n) => !same(n, { t, email }));
}

export function canEdit(n: Note, me: string | undefined): boolean {
  return !!me && n.email === me;
}

/** Authors delete their own notes; co-chairs and the EIC delete any note. */
export function canDelete(n: Note, me: string | undefined, roles: KnownRoles): boolean {
  return canEdit(n, me) || !!roles.coChair || !!roles.eic;
}

/**
 * Merge the server's notes for one manuscript into ours. The newer edit
 * wins; a note we had synced that the server no longer has was deleted
 * there; notes not yet sent are kept.
 */
export function mergeNotes(local: Note[], server: Note[]): Note[] {
  let out = local.filter((n) => !n.synced || server.some((s) => same(s, n)));
  for (const s of server) {
    const have = out.find((n) => same(n, s));
    if (!have || s.updated >= have.updated) out = upsertNote(out, { ...s, synced: true });
  }
  return out;
}

/**
 * Notes as stored. Builds before 0.0.40 kept one text per manuscript ID
 * (Record<string, string>); those become one note each, by `who`, dated now.
 */
export function migrateNotes(stored: unknown, who: { email: string; author: string }, now: number): NotesStore {
  if (!stored || typeof stored !== 'object') return {};
  const out: NotesStore = {};
  for (const [id, v] of Object.entries(stored as Record<string, unknown>)) {
    if (Array.isArray(v)) out[id] = v as Note[];
    else if (typeof v === 'string' && v.trim()) {
      const m = id.replace(/\.R\d+$/, '');
      out[m] = upsertNote(out[m] ?? [], { m, t: now, email: who.email, author: who.author, text: v, updated: now });
    }
  }
  return out;
}

/** Whether notes are still in the pre-0.0.40 shape. */
export function needsMigration(stored: unknown): boolean {
  return !!stored && typeof stored === 'object' && Object.values(stored).some((v) => typeof v === 'string');
}

/**
 * A title as people type and MC shows it, made comparable: Unicode
 * compatibility forms, straight quotes and hyphens, lower case, single spaces.
 */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * SHA-256 (hex) of the normalized title. The server checks it against the
 * first one it saw for the manuscript; the title itself never leaves the browser.
 */
export async function titleHash(title: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeTitle(title)));
  return hex(new Uint8Array(d));
}

export function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
