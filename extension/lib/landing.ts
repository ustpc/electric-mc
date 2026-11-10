// Where to land after logging in. Someone who is both an AE and a co-chair
// lands on MC's welcome page and has to pick a center every time; with the
// setting on, the first page after a login goes on to the Co-Chair Center.
// The login page marks the tab (sessionStorage, so only this tab and only
// this session); the next MC page that isn't a login or verification page
// uses the mark and clears it, so later visits to the welcome page are left
// alone.

import { textOf } from './text';

const MARK = 'emc-logged-in-at';
/** A mark older than this is stale (an abandoned login). */
const FRESH_MS = 5 * 60_000;

const CO_CHAIR = /\bco-?chair (center|dashboard)\b/i;
const AE = /\b(associate editor|AE) (center|dashboard)\b/i;

/** Call when the login form is submitted, by the person or the password manager. */
export function markLoggedIn(win: Window, now = Date.now()): void {
  try {
    win.sessionStorage.setItem(MARK, String(now));
  } catch {
    /* storage blocked: no redirect */
  }
}

/** Mark the tab whenever this login form is submitted. Returns a function that stops watching. */
export function watchLoginSubmit(password: HTMLInputElement, submit: HTMLElement | null): () => void {
  const win = password.ownerDocument.defaultView!;
  const mark = () => markLoggedIn(win);
  const onKey = (e: KeyboardEvent) => e.key === 'Enter' && mark();
  const form = password.form;
  form?.addEventListener('submit', mark, true);
  submit?.addEventListener('click', mark, true);
  password.addEventListener('keydown', onKey, true);
  return () => {
    form?.removeEventListener('submit', mark, true);
    submit?.removeEventListener('click', mark, true);
    password.removeEventListener('keydown', onKey, true);
  };
}

/** Still on a step of logging in: the login form or MC's emailed-code check. */
function loggingIn(doc: Document): boolean {
  return !!doc.querySelector('input[type=password]') || /\b(unrecognized device|verification code)\b/i.test(textOf(doc.body));
}

/**
 * On the first page after a login, the Co-Chair Center link to press, when
 * the person can also go to the AE Center and isn't already in the Co-Chair
 * Center. Uses up the login mark (except on a login step). Links in MC's
 * menus count, since the centers are listed there on every page.
 */
export function coChairLanding(doc: Document, now = Date.now()): HTMLElement | null {
  const win = doc.defaultView;
  if (!win) return null;
  let at = 0;
  try {
    at = Number(win.sessionStorage.getItem(MARK) ?? 0);
  } catch {
    return null;
  }
  if (!at || loggingIn(doc)) return null;
  try {
    win.sessionStorage.removeItem(MARK);
  } catch {
    /* ignore */
  }
  if (now - at > FRESH_MS) return null;
  const links = Array.from(doc.querySelectorAll<HTMLElement>('a')).filter((a) => textOf(a).length < 60);
  const coChair = links.find((a) => CO_CHAIR.test(textOf(a)));
  if (!coChair || !links.some((a) => AE.test(textOf(a)))) return null;
  // Already there: the page's heading or breadcrumb names the co-chair center.
  const here = Array.from(doc.querySelectorAll('h1,h2,.breadcrumb,[class*=breadcrumb] li,title')).some((el) => !el.closest('a') && CO_CHAIR.test(textOf(el)));
  return here ? null : coChair;
}
