// Page classification. Manuscript Central navigates with form posts and
// opaque URLs, so the page type comes from what is on the page, not the URL.
// Each page type collects weighted signals; the highest total wins. Every
// signal is returned so the debug log shows why a page was classified.

import { findManuscriptIds } from '../lib/ids';
import { labelKey, normalize, ownText, textOf } from '../lib/text';
import { dataTables, headings, labeledValues } from './dom';
import type { PageType, Signal } from './types';

export interface Classification {
  pageType: PageType;
  confidence: number;
  alternatives: Array<{ pageType: PageType; score: number }>;
  signals: Signal[];
}

const TYPES: PageType[] = ['login', 'main-menu', 'role-center', 'queue-list', 'manuscript', 'popup'];

const CENTER_RE = /\b(author|reviewer|associate editor|editor|admin|chair|editor-in-chief|co-chair|editorial office|production) center\b/i;
const MS_LABELS = [
  /^manuscript id$/,
  /^title$/,
  /^author/,
  /^reviewer list$|^reviewers?$/,
  /^abstract$/,
  /^keywords?$/,
  /^manuscript type$|^type$/,
  /^date submitted$|^submitted$/,
  /^manuscript status$|^status$/,
  /^associate editor$/,
];
const QUEUE_HEADERS = /^(manuscript id|id|title|status|submitted|date submitted|due|due date|take action|action|days|days in folder|associate editor|decision)$/;

export function classify(doc: Document, idPattern?: string): Classification {
  const signals: Signal[] = [];
  const add = (pageType: PageType, name: string, weight: number, detail?: string) =>
    signals.push({ pageType, name, weight, detail });

  const body = doc.body;
  const text = textOf(body);
  const heads = headings(doc);
  const heading = heads[0] ?? '';
  const ids = findManuscriptIds(text, idPattern);

  // login
  if (doc.querySelector('input[type=password]')) add('login', 'password input', 3);
  if (/\b(log in|login|sign in)\b/i.test(text) && /\b(user id|email|password)\b/i.test(text))
    add('login', 'login words', 2);
  if (/\bcreate an account\b|\breset password\b/i.test(text)) add('login', 'account links', 1);

  // main menu: links to several role centers
  const centerLinks = Array.from(doc.querySelectorAll('a,button,[role=tab],li'))
    .map((el) => textOf(el))
    .filter((t) => t.length < 60 && CENTER_RE.test(t));
  const distinctCenters = new Set(centerLinks.map((t) => t.toLowerCase()));
  if (distinctCenters.size >= 2) add('main-menu', 'center links', 2, [...distinctCenters].join(' | '));
  // "Main Menu" is also a navigation link on every page, so only count it as
  // a heading or as plain text, not inside a link.
  const mainMenuText = Array.from(doc.querySelectorAll('h1,h2,h3,p,span,td,div,b'))
    .some((el) => !el.closest('a') && /^main menu$/i.test(ownTextOrOnly(el)));
  if (/\b(main menu|welcome to)\b/i.test(heading) || mainMenuText) add('main-menu', 'main menu words', 2);

  // role center: heading names a center, page lists queues with counts
  const queueCounts = countQueues(doc);
  if (CENTER_RE.test(heading)) add('role-center', 'center heading', 2, heading);
  if (queueCounts >= 2) add('role-center', 'queue counts', Math.min(4, queueCounts), `${queueCounts} queues`);
  if (queueCounts >= 2 && ids.length === 0) add('role-center', 'no manuscript ids', 1);

  // queue list: a data table whose rows carry manuscript IDs
  const tables = dataTables(doc);
  let bestRows = 0;
  let bestHeaders = 0;
  for (const t of tables) {
    const rowsWithId = t.rows.filter((r) => findManuscriptIds(r.map((c) => textOf(c)).join(' '), idPattern).length > 0).length;
    const headerHits = t.headers.filter((h) => QUEUE_HEADERS.test(h)).length;
    if (rowsWithId > bestRows) bestRows = rowsWithId;
    if (rowsWithId > 0 && headerHits > bestHeaders) bestHeaders = headerHits;
  }
  if (bestRows >= 2) add('queue-list', 'table rows with ids', Math.min(5, 1 + bestRows), `${bestRows} rows`);
  else if (bestRows === 1 && bestHeaders >= 2) add('queue-list', 'one-row queue table', 2);
  if (bestHeaders >= 2) add('queue-list', 'queue headers', bestHeaders >= 3 ? 2 : 1, `${bestHeaders} matching headers`);

  // manuscript: one dominant ID and manuscript labels
  const fields = labeledValues(body);
  const labelHits = MS_LABELS.filter((re) => [...fields.keys()].some((k) => re.test(k))).length;
  if (labelHits >= 3) add('manuscript', 'manuscript labels', Math.min(5, labelHits), `${labelHits} labels`);
  if (ids.length >= 1 && ids.length <= 2 && bestRows < 2) add('manuscript', 'single manuscript id', 2, ids[0]?.id);
  if (/\b(make (a )?recommendation|make decision|reviewer list|view (full )?abstract|manuscript information)\b/i.test(text))
    add('manuscript', 'manuscript actions', 1);
  if (fields.has('manuscript id')) add('manuscript', 'manuscript id label', 2);

  // popup: opened by MC with window.open, or a "Close Window" button
  const view = doc.defaultView;
  let opener = false;
  try {
    opener = !!view && !!view.opener && view.opener !== view;
  } catch {
    opener = true; // cross-origin opener still means a popup
  }
  if (opener) add('popup', 'window.opener', 3);
  if (/\bclose (this )?window\b/i.test(text)) add('popup', 'close window', 3);
  if (body && body.querySelectorAll('*').length < 80 && !doc.querySelector('nav,header')) add('popup', 'small page', 2);

  // Sum and rank.
  const scores = new Map<PageType, number>(TYPES.map((t) => [t, 0]));
  for (const s of signals) scores.set(s.pageType, (scores.get(s.pageType) ?? 0) + s.weight);
  // A queue page with an ID column is not a manuscript page.
  // Its column headers (Title, Status, Submitted) look like manuscript labels.
  if (bestRows >= 2) scores.set('manuscript', (scores.get('manuscript') ?? 0) - 4);
  // Popups often show one manuscript's details. Call them popups (the
  // manuscript fields are still extracted) rather than full manuscript pages.
  if ((scores.get('popup') ?? 0) >= 4) scores.set('manuscript', (scores.get('manuscript') ?? 0) - 2);
  // A logged-in page can't be the login page.
  if (/\blog ?out\b/i.test(text)) scores.set('login', (scores.get('login') ?? 0) - 3);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const topScore = top?.[1] ?? 0;
  const pageType: PageType = top && topScore >= 3 ? top[0] : 'unknown';
  const margin = topScore - (second?.[1] ?? 0);
  const confidence = pageType === 'unknown' ? 0 : Math.min(1, (topScore / 8) * 0.6 + (margin / Math.max(topScore, 1)) * 0.4);

  return {
    pageType,
    confidence: Math.round(confidence * 100) / 100,
    alternatives: ranked.slice(0, 3).map(([pageType, score]) => ({ pageType, score })),
    signals,
  };
}

/**
 * Count "queue name … number" entries: a link or cell that names a queue next
 * to a bare count. Queue names vary by journal, so any short phrase with a
 * number beside it in a list or table counts.
 */
export function queueEntries(doc: Document): Array<{ name: string; count: number; el: Element }> {
  const out: Array<{ name: string; count: number; el: Element }> = [];
  const seen = new Set<string>();
  const push = (name: string, count: number, el: Element) => {
    const n = normalize(name).replace(/[\s:-]+$/, '');
    const key = n.toLowerCase();
    if (!n || n.length > 80 || seen.has(key) || /^\d+$/.test(n)) return;
    seen.add(key);
    out.push({ name: n, count, el });
  };

  // Rows: name in one cell, count in another.
  for (const tr of Array.from(doc.querySelectorAll('tr'))) {
    if (tr.querySelector('table')) continue;
    const cells = Array.from(tr.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
    if (cells.length < 2 || cells.length > 4) continue;
    const texts = cells.map((c) => textOf(c));
    const numIdx = texts.findIndex((t) => /^\d{1,4}$/.test(t));
    const nameIdx = texts.findIndex((t) => /[A-Za-z]{3}/.test(t) && t.length < 80);
    if (numIdx >= 0 && nameIdx >= 0 && numIdx !== nameIdx) push(texts[nameIdx]!, Number(texts[numIdx]), tr);
  }
  // Inline: "Awaiting Reviewer Scores (3)" or "3 Awaiting Reviewer Scores" in links and list items.
  for (const el of Array.from(doc.querySelectorAll('a,li,button'))) {
    const t = textOf(el);
    if (t.length > 90) continue;
    let m = /^(.*[A-Za-z]{3}.*?)\s*\((\d{1,4})\)$/.exec(t);
    if (m && m[1]) {
      push(m[1], Number(m[2]), el);
      continue;
    }
    m = /^(\d{1,4})\s+(.*[A-Za-z]{3}.*)$/.exec(t);
    if (m && m[2]) push(m[2], Number(m[1]), el);
  }
  return out.filter((q) => !/^(page|step|of)\b/i.test(q.name) && !labelKey(q.name).startsWith('manuscript id'));
}

function countQueues(doc: Document): number {
  return queueEntries(doc).filter((q) => /\b(awaiting|overdue|requiring|ready|pending|in review|in draft|submitted|revision|decision|scores|recommendation|invited|assigned|due)\b/i.test(q.name)).length;
}

function ownTextOrOnly(el: Element): string {
  return ownText(el) || (el.children.length === 0 ? textOf(el) : '');
}
