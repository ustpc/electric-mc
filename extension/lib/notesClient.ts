// Talking to the notes server (backend/notes), when one is set in Settings.
//
// Each browser makes its own signing key (ECDSA P-256) the first time it
// sends a note. The private key can't be exported: it stays in this
// browser's IndexedDB. The key is registered once, with a signed statement
// of who MC says is logged in and the name they gave us; the first upload
// of a key is taken as legitimate, and one person may register several
// keys (one per browser profile). The project owner can ban a key. Every
// request after that is signed, so the server knows who wrote each note.
//
// Requests also carry (manuscript ID, hash of its title), which the server
// checks; the title itself is never sent. Requests are plain-text POSTs, so
// no extra extension permission is needed: the server answers with CORS
// headers.

import type { McIdentity } from './identity';
import { hex, nowS, type Note } from './notes';

export interface Me {
  identity: McIdentity;
  /** The author label notes show (lib/identity.ts authorLabel). */
  label: string;
  mcName: string;
}

interface KeyRecord {
  email: string;
  keyId: string;
  privateKey: CryptoKey;
  /** The public key, SubjectPublicKeyInfo, base64. */
  spki: string;
  /** The label last registered with the server, if any. */
  registered?: string;
}

export class NotesError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const DB = 'electric-mc';
const STORE = 'keys';

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'email' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((ok, fail) => {
      const req = run(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => ok(req.result as T);
      req.onerror = () => fail(req.error);
    });
  } finally {
    d.close();
  }
}

/** This browser's key for one MC account, made on first use. */
async function keyFor(email: string): Promise<KeyRecord> {
  const have = await idb<KeyRecord | undefined>('readonly', (s) => s.get(email));
  if (have) return have;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const rec: KeyRecord = { email, keyId: await keyIdOf(spki), privateKey: pair.privateKey, spki: b64(spki) };
  await idb('readwrite', (s) => s.put(rec));
  return rec;
}

/** The key's ID: the first 128 bits of SHA-256 of its public key, in hex. */
export async function keyIdOf(spki: Uint8Array<ArrayBuffer>): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', spki))).slice(0, 32);
}

/** This browser's key ID for an account, if it has made one. */
export async function myKeyId(email: string): Promise<string | undefined> {
  return (await idb<KeyRecord | undefined>('readonly', (s) => s.get(email)).catch(() => undefined))?.keyId;
}

function b64(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b));
}

async function post(server: string, rec: KeyRecord, payload: Record<string, unknown>, withSpki = false): Promise<Record<string, unknown>> {
  const body = JSON.stringify({ ...payload, ts: nowS() });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, rec.privateKey, new TextEncoder().encode(body)));
  const res = await fetch(server, {
    method: 'POST',
    // text/plain keeps this a "simple" request: no CORS preflight.
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ key: rec.keyId, payload: body, sig: b64(sig), ...(withSpki ? { spki: rec.spki } : {}) }),
  });
  const got = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new NotesError(String(got.error ?? `server said ${res.status}`), res.status);
  return got;
}

/** Register this browser's key (again, if the person's name changed). */
async function registered(server: string, me: Me): Promise<KeyRecord> {
  const rec = await keyFor(me.identity.email);
  if (rec.registered === me.label) return rec;
  const id = me.identity;
  await post(server, rec, { op: 'register', email: id.email, label: me.label, mcName: me.mcName, personId: id.personId, role: id.role, journal: id.journal }, true);
  const next = { ...rec, registered: me.label };
  await idb('readwrite', (s) => s.put(next));
  return next;
}

async function call(server: string, me: Me, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return post(server, await registered(server, me), payload);
}

export async function listNotes(server: string, me: Me, m: string, h: string): Promise<Note[]> {
  const got = await call(server, me, { op: 'list', m, h });
  return (got.notes as Note[] | undefined) ?? [];
}

/** Send a new note or an edit; the server keeps one note per (manuscript, session, author). */
export async function putNote(server: string, me: Me, n: Note, h: string): Promise<void> {
  await call(server, me, { op: 'put', m: n.m, h, t: n.t, text: n.text, updated: n.updated });
}

export async function deleteNote(server: string, me: Me, m: string, h: string, t: number, email: string): Promise<void> {
  await call(server, me, { op: 'delete', m, h, t, email });
}

/** Ban a key (project owner only): its notes stay, but it can't send more. */
export async function banKey(server: string, me: Me, keyId: string): Promise<void> {
  await call(server, me, { op: 'ban', key: keyId });
}
