// Authored notes: editing sessions, who may edit and delete, merging with
// the server, migration from one-text-per-manuscript, and title hashing.
// Synthetic IDs and people only.
import { describe, expect, it } from 'vitest';
import { canDelete, canEdit, mergeNotes, migrateNotes, needsMigration, normalizeTitle, removeNote, SESSION_GAP_S, sessionNote, titleHash, upsertNote, type Note } from '../lib/notes';

const M = 'XYZJ-26-01-9001';
const note = (t: number, email: string, text = 'x', updated = t): Note => ({ m: M, t, email, author: email, text, updated });
const ALICE = 'alice@example.org';
const CAROL = 'carol@example.org';

describe('sessionNote', () => {
  it("continues the person's newest note within an hour of its last edit", () => {
    const list = [note(1000, ALICE), note(5000, ALICE, 'y', 6000), note(7000, CAROL)];
    expect(sessionNote(list, ALICE, 6000 + SESSION_GAP_S - 1)?.t).toBe(5000);
  });
  it('starts a new note after an hour away', () => {
    expect(sessionNote([note(5000, ALICE, 'y', 6000)], ALICE, 6000 + SESSION_GAP_S)).toBeNull();
  });
  it("never continues someone else's note", () => {
    expect(sessionNote([note(5000, CAROL)], ALICE, 5001)).toBeNull();
  });
});

describe('upsertNote and removeNote', () => {
  it('overwrites the same session and author, keeping others, oldest first', () => {
    const list = upsertNote([note(2000, ALICE, 'old'), note(1000, CAROL)], note(2000, ALICE, 'new', 2500));
    expect(list.map((n) => [n.t, n.email, n.text])).toEqual([[1000, CAROL, 'x'], [2000, ALICE, 'new']]);
  });
  it('removes only the matching note', () => {
    expect(removeNote([note(1, ALICE), note(1, CAROL)], 1, ALICE).map((n) => n.email)).toEqual([CAROL]);
  });
});

describe('permissions', () => {
  const n = note(1, ALICE);
  it('lets authors edit and delete their own notes', () => {
    expect(canEdit(n, ALICE)).toBe(true);
    expect(canDelete(n, ALICE, {})).toBe(true);
  });
  it("doesn't let others edit or delete", () => {
    expect(canEdit(n, CAROL)).toBe(false);
    expect(canDelete(n, CAROL, { ae: '2026-01-01' })).toBe(false);
    expect(canEdit(n, undefined)).toBe(false);
  });
  it('lets co-chairs and the EIC delete any note, but not edit it', () => {
    expect(canDelete(n, CAROL, { coChair: '2026-01-01' })).toBe(true);
    expect(canDelete(n, CAROL, { eic: '2026-01-01' })).toBe(true);
    expect(canEdit(n, CAROL)).toBe(false);
  });
});

describe('mergeNotes', () => {
  it('takes the newer edit of each note', () => {
    const local = [note(1, ALICE, 'local', 50)];
    expect(mergeNotes(local, [note(1, ALICE, 'server', 40)])[0]!.text).toBe('local');
    expect(mergeNotes(local, [note(1, ALICE, 'server', 60)])[0]).toMatchObject({ text: 'server', synced: true });
  });
  it('drops synced notes the server deleted and keeps unsent ones', () => {
    const local = [{ ...note(1, CAROL), synced: true }, note(2, ALICE)];
    expect(mergeNotes(local, []).map((n) => n.t)).toEqual([2]);
  });
  it("adds notes we didn't have", () => {
    expect(mergeNotes([], [note(3, CAROL)]).map((n) => n.email)).toEqual([CAROL]);
  });
});

describe('migrateNotes', () => {
  const who = { email: ALICE, author: 'Alice AE' };
  it('turns one text per manuscript into an authored note under the base ID', () => {
    const old = { [M]: 'first', 'XYZJ-26-01-9002.R1': 'second', 'XYZJ-26-01-9003': '  ' };
    expect(needsMigration(old)).toBe(true);
    const got = migrateNotes(old, who, 1234);
    expect(Object.keys(got).sort()).toEqual([M, 'XYZJ-26-01-9002']);
    expect(got['XYZJ-26-01-9002']![0]).toEqual({ m: 'XYZJ-26-01-9002', t: 1234, email: ALICE, author: 'Alice AE', text: 'second', updated: 1234 });
  });
  it('leaves notes already in the new shape alone', () => {
    const now = { [M]: [note(1, ALICE)] };
    expect(needsMigration(now)).toBe(false);
    expect(migrateNotes(now, who, 9)).toEqual(now);
    expect(needsMigration(undefined)).toBe(false);
  });
});

describe('titles', () => {
  it('normalizes case, quotes, dashes and spaces', () => {
    expect(normalizeTitle('  This Is a “Test” — It’s  Fine ')).toBe('this is a "test" - it\'s fine');
  });
  it('hashes equal titles alike and different titles apart', async () => {
    const a = await titleHash('This is a test!');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await titleHash('THIS IS A  TEST!')).toBe(a);
    expect(await titleHash('This is another test!')).not.toBe(a);
  });
});
