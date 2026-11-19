// Per-tab state that has to survive MC's page loads: sessionStorage, which
// belongs to this tab only and is gone when it closes. Every key any module
// uses is named here, so modules never reach into each other's keys, and
// every read and write is guarded (storage can be blocked, and JSON can be
// left half-written by an older build). Values are JSON.

export const TAB_KEYS = {
  /** lib/advance.ts: the direction last moved in a list (1 or -1). */
  navDir: 'emc-nav-dir',
  /** lib/advance.ts: a recommendation just submitted; open the next manuscript. */
  advance: 'emc-advance',
  /** lib/advance.ts: the Take Action grid's order of IDs. */
  gridOrder: 'emc-grid-order',
  /** lib/advance.ts: the task to open again on the next manuscript. */
  carryTask: 'emc-carry-task',
  /** lib/advance.ts: the task last opened, and on which manuscript. */
  openedTask: 'emc-opened-task',
  /** lib/search.ts: a manuscript being opened by search. */
  openManuscript: 'emc-open-manuscript',
  /** lib/onebutton.ts: a one-button reject run. */
  oneButton: 'emc-one-button',
  /** lib/onebutton.ts: the manuscript whose PDF was opened on this visit. */
  oneButtonPdf: 'emc-one-button-pdf',
  /** lib/landing.ts: when the login was submitted. */
  loggedInAt: 'emc-logged-in-at',
  /** lib/login.ts: the last automatic Log In press. */
  autoLoginAt: 'emc-auto-login-at',
  /** entrypoints/content.ts: a decision noted at Submit, kept once MC answers. */
  submittedChoice: 'emc-submitted-choice',
} as const;

export type TabKey = keyof typeof TAB_KEYS;

type Where = Document | Window | null | undefined;

function storage(where: Where): Storage | null {
  try {
    const win = where && 'defaultView' in where ? where.defaultView : where;
    return win?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** A value, or null when missing, unreadable or blocked. */
export function tabGet<T>(where: Where, key: TabKey): T | null {
  try {
    const raw = storage(where)?.getItem(TAB_KEYS[key]);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Set a value; null removes it. */
export function tabSet(where: Where, key: TabKey, value: unknown): void {
  try {
    if (value === null || value === undefined) storage(where)?.removeItem(TAB_KEYS[key]);
    else storage(where)?.setItem(TAB_KEYS[key], JSON.stringify(value));
  } catch {
    /* storage blocked or full */
  }
}

/** Read a value and remove it. */
export function tabTake<T>(where: Where, key: TabKey): T | null {
  const v = tabGet<T>(where, key);
  tabSet(where, key, null);
  return v;
}
