// MC's DOCUMENT_HASHCODE on a manuscript page (Create and Add, 0.0.105).
// After a reviewer is added with Create Account On The Fly, MC reloads the
// manuscript page, and with E-MC on that page has come back with an empty
// DOCUMENT_HASHCODE; the next popup copies the empty code and MC refuses its
// Create and Add. Until the cause is found, E-MC remembers the code of the
// manuscript page in this tab and puts it back when the same manuscript
// comes back without one. The code never leaves the tab.

import { tabGet, tabSet } from './tabstate';

const KEY = 'docHash';
/** A remembered code older than this is not used. */
export const DOC_HASH_MS = 30 * 60_000;

interface Saved {
  id: string;
  value: string;
  at: number;
}

/**
 * Remember or restore the code for manuscript `id`. Returns 'kept' when the
 * page has a code (now remembered), 'restored' when an empty one was filled
 * from the remembered code, or null.
 */
export function keepDocHash(doc: Document, id: string | null | undefined, now = Date.now()): 'kept' | 'restored' | null {
  const win = doc.defaultView;
  const field = doc.querySelector<HTMLInputElement>('input[name="DOCUMENT_HASHCODE"]');
  if (!win || !field || !id) return null;
  if (field.value) {
    tabSet(win, KEY, { id, value: field.value, at: now } satisfies Saved);
    return 'kept';
  }
  const saved = tabGet<Saved>(win, KEY);
  if (!saved || saved.id !== id || now - saved.at > DOC_HASH_MS) return null;
  field.value = saved.value;
  return 'restored';
}
