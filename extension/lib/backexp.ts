// The Back-link experiment (test builds, developer mode, off unless turned
// on). Does a link on an MC page that Back brought up again still work when
// pressed later in the session? MC pages are form posts whose hidden fields
// (CURRENT_PAGE, PAGE_TOKEN, XIK_…) say where the person is; nobody knows
// how many of them MC checks. The experiment marks a page shown by Back,
// lets the person send its links either as saved or with the hidden fields
// of the latest live page swapped in, and logs what MC answers. Only MC's
// page names, field names, a kind of link and yes/no results are logged,
// never field values or page text. Nothing is ever sent in the background:
// the person presses the link in the visible tab.

import { tabGet, tabSet, tabTake } from './tabstate';
import { labelKey, textOf } from './text';

export type Variant = 'as-saved' | 'latest';

/** The hidden fields of MC's forms on a page, by name (first value wins). */
export function hiddenFields(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of Array.from(doc.querySelectorAll<HTMLInputElement>('form input[type=hidden]'))) {
    if (i.closest('[data-electric-mc]')) continue;
    const k = i.name || i.id;
    if (k && !(k in out)) out[k] = i.value;
  }
  return out;
}

/**
 * Fields that name the page or the action a link sets: these stay as the
 * saved page had them, or MC would read the press as made on another page.
 */
export function keepsOwnValue(name: string): boolean {
  return name === 'CURRENT_PAGE' || name === 'NEXT_PAGE' || name === 'XIK_TAGACT' || /^XIK_/.test(name);
}

/** The names whose saved value differs from the latest live page's (values never leave this tab). */
export function differing(saved: Record<string, string>, latest: Record<string, string>): string[] {
  return Object.keys(saved).filter((k) => k in latest && latest[k] !== saved[k]).sort();
}

/**
 * Put the latest live page's values into the saved page's hidden fields,
 * except those that name the page or the action. Returns the names changed.
 */
export function swapInLatest(doc: Document, latest: Record<string, string>): string[] {
  const changed = new Set<string>();
  for (const i of Array.from(doc.querySelectorAll<HTMLInputElement>('form input[type=hidden]'))) {
    const k = i.name || i.id;
    if (!k || keepsOwnValue(k) || !(k in latest) || latest[k] === i.value) continue;
    i.value = latest[k]!;
    changed.add(k);
  }
  return [...changed].sort();
}

/** What kind of MC link was pressed, from its text and handler; the text itself is never kept. */
export function linkKind(el: Element, isId: (s: string) => boolean): 'manuscript' | 'queue' | 'task' | 'dashboard' | 'tab' | 'other' {
  const t = labelKey(`${textOf(el)} ${el.getAttribute('alt') ?? ''} ${el.getAttribute('title') ?? ''}`);
  const code = `${el.getAttribute('onclick') ?? ''} ${el.getAttribute('href') ?? ''}`;
  if (isId(textOf(el)) || /MANUSCRIPT_DETAILS/i.test(code) || /take action/.test(t)) return 'manuscript';
  if (/awaiting|queue|manuscripts|search results|in review|returned/.test(t) || /VIEW_MANUSCRIPTS/i.test(code)) return 'queue';
  if (/recommend|decision|reviewers|assign|invite|score|checklist|immediate/.test(t)) return 'task';
  if (/dashboard|center|home/.test(t)) return 'dashboard';
  if (/audit trail|manuscript information|details|abstract|cover letter|original files/.test(t)) return 'tab';
  return 'other';
}

/** The MC control a press lands on: a link, button or image button, not ours. */
export function mcControl(target: EventTarget | null): Element | null {
  const el = target instanceof Element ? target.closest('a, button, input[type=button], input[type=submit], input[type=image]') : null;
  return el && !el.closest('[data-electric-mc]') ? el : null;
}

/** Whether MC's answer looks like an error or "session expired" page. */
export function looksLikeError(doc: Document): boolean {
  const t = labelKey(textOf(doc.body).slice(0, 4000));
  return /an error has occurred|unexpected error|session (has )?expired|session has timed out|invalid request|page has expired|not authorized|please log in/.test(t);
}

// ---------- per-tab state ----------

export interface Trial {
  n: number;
  variant: Variant;
  from: string | null;
  kind: string;
  swapped: string[];
  at: number;
}

export interface Latest {
  page: string | null;
  fields: Record<string, string>;
}

export const readLatest = (doc: Document) => tabGet<Latest>(doc, 'backExpLatest');
export const writeLatest = (doc: Document, l: Latest) => tabSet(doc, 'backExpLatest', l);
export const takeTrial = (doc: Document) => tabTake<Trial>(doc, 'backExpTrial');
export const writeTrial = (doc: Document, t: Trial) => tabSet(doc, 'backExpTrial', t);
export const nextTrialNumber = (doc: Document) => {
  const n = (tabGet<number>(doc, 'backExpCount') ?? 0) + 1;
  tabSet(doc, 'backExpCount', n);
  return n;
};
export const readVariant = (doc: Document): Variant => (tabGet<Variant>(doc, 'backExpVariant') === 'latest' ? 'latest' : 'as-saved');
export const writeVariant = (doc: Document, v: Variant) => tabSet(doc, 'backExpVariant', v);
