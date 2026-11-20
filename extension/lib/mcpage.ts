// MC's own name for the page on screen. Every MC page is one server-rendered
// form whose hidden CURRENT_PAGE field names the page
// ("ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS", "ASSOCIATE_EDITOR_DASHBOARD",
// "LOGIN", "HOME", "…_POPUP"), next to the action fields (XIK_TAGACT,
// PAGE_TOKEN, NEXT_PAGE …) its links set before posting the form. The name is
// MC's, not data about a manuscript, so it can be logged.

import type { PageType } from '../parsers/types';

/** MC's CURRENT_PAGE for this document, or null on pages without MC's form. */
export function currentPage(doc: Document): string | null {
  const input = doc.querySelector<HTMLInputElement>('input[type=hidden][name="CURRENT_PAGE"]');
  const v = input?.value?.trim() ?? '';
  return /^[A-Z][A-Z0-9_]{1,80}$/.test(v) ? v : null;
}

/** The page type an MC page name implies, or null when the name doesn't say. */
export function pageTypeOf(name: string | null | undefined): PageType | null {
  if (!name) return null;
  // A manuscript's details in a popup (a reviewer's view) is still that manuscript's page.
  if (/_MANUSCRIPT_DETAILS(_POPUP[A-Z_]*)?$/.test(name)) return 'manuscript';
  if (/POPUP|POP_UP/.test(name)) return 'popup';
  if (name === 'LOGIN' || /^LOGIN_/.test(name)) return 'login';
  // HOME is the welcome page, before and after logging in: it doesn't say which.
  if (/_VIEW_MANUSCRIPTS(_SR)?$|_SEARCH_RESULTS?$/.test(name)) return 'queue-list';
  if (/_DASHBOARD$|_CENTER$/.test(name)) return 'role-center';
  return null;
}
