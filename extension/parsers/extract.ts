// Field extraction for each page type. Every extractor tries more than one
// strategy and records which one worked in `strategies`, so a log from a user
// whose page changed shows which fallback kicked in.

import { findManuscriptIds, parseManuscriptId } from '../lib/ids';
import { cellLines, labelKey, normalize, textOf, truncate, isLayoutRow } from '../lib/text';
import { queueEntries } from './classify';
import { breadcrumb, dataTables, labeledValues, pick, type SimpleTable } from './dom';
import type { ManuscriptDetails, Person, QueueCount, QueueRow } from './types';

export interface Extracted<T> {
  value: T;
  strategies: Record<string, string>;
  warnings: string[];
}

// ---------- role center ----------

export function extractQueues(doc: Document): Extracted<QueueCount[]> {
  const entries = queueEntries(doc);
  const value = entries.map(({ name, count }) => ({ name, count }));
  return {
    value,
    strategies: { queues: entries.length ? 'name+count pairs' : 'none' },
    warnings: entries.length ? [] : ['role center: no queue counts found'],
  };
}

// ---------- queue list ----------

const COL = {
  id: [/^manuscript id$/, /^id$/, /manuscript/, /^ms ?#?$/],
  title: [/^title$/, /title/],
  status: [/^status$/, /status/, /^decision$/],
  submitted: [/submitted/, /^date$/],
  due: [/due/],
  days: [/days/],
  ae: [/associate editor/, /^ae$/, /editor/],
};

function colIndex(headers: string[], res: RegExp[]): number {
  for (const re of res) {
    const i = headers.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

export function extractRows(doc: Document, idPattern?: string): Extracted<QueueRow[]> {
  const strategies: Record<string, string> = {};
  const warnings: string[] = [];
  const tables = dataTables(doc)
    .map((t) => ({ t, n: t.rows.filter((r) => findManuscriptIds(r.map((c) => textOf(c)).join(' '), idPattern).length).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const best: SimpleTable | undefined = tables[0]?.t;
  if (!best) return { value: [], strategies: { rows: 'none' }, warnings: ['queue list: no table with manuscript ids'] };

  const headers = best.headers;
  strategies.rows = headers.length ? 'table with headers' : 'table without headers';
  if (!headers.length) warnings.push('queue list: no header row; columns guessed by content');
  const idx = Object.fromEntries(Object.entries(COL).map(([k, res]) => [k, colIndex(headers, res)])) as Record<keyof typeof COL, number>;

  const rows: QueueRow[] = [];
  for (const cells of best.rows) {
    const texts = cells.map((c) => textOf(c));
    // ID: header column if present, else any cell containing one.
    let ref = idx.id >= 0 ? parseManuscriptId(texts[idx.id] ?? '', idPattern) : null;
    if (ref) strategies.id ??= 'id column';
    if (!ref) {
      ref = parseManuscriptId(texts.join(' '), idPattern);
      if (ref) strategies.id = 'any cell';
    }
    if (!ref) continue;

    const rec: Record<string, string> = {};
    texts.forEach((t, i) => {
      const key = headers[i] || `col${i}`;
      if (t) rec[key] = truncate(t, 300);
    });

    let title = idx.title >= 0 ? texts[idx.title]?.replace(/\s*\[\s*view submission\s*\]\s*$/i, '') : undefined;
    if (title && idx.title === idx.id) title = title.replace(ref.id, '').trim() || undefined;
    if (title) strategies.title ??= 'title column';
    if (!title) {
      // Longest text cell that isn't the ID cell or a date is probably the title.
      title = texts
        .filter((t) => !t.includes(ref!.baseId) && !/^\d/.test(t) && t.length > 15)
        .sort((a, b) => b.length - a.length)[0];
      if (title) strategies.title = 'longest cell';
    }
    // One line per role and per action bullet ("AE: …", "CC: …", "• Assign AE").
    const status = idx.status >= 0 && cells[idx.status] ? cellLines(cells[idx.status]!).join('\n') : undefined;
    rows.push({ ...ref, title: title ? truncate(title, 300) : undefined, status: status || undefined, cells: rec });
  }
  if (!rows.length) warnings.push('queue list: rows found but no ids parsed');
  return { value: rows, strategies, warnings };
}

// ---------- manuscript page ----------

// Field names that turn up where a title should be ("Date Submitted").
const LABEL_WORDS = /^(date submitted|date|submitted|status|manuscript (id|type|status|title)|title|author\(?s\)?|keywords?|abstract|type|decision|due|days|reviewers?|associate editor|editor|take action|action|actions)\b/i;

export function looksLikeLabel(s: string): boolean {
  const t = s.trim();
  if (/:$/.test(t)) return true;
  if (DATE.test(t) && t.length < 20) return true;
  return LABEL_WORDS.test(t) && t.split(/\s+/).length <= 4;
}

const DATE = /\b\d{1,2}-[A-Z][a-z]{2}-\d{4}\b/;

/** "09-Sep-2026; Last Updated: …" → "09-Sep-2026". */
function firstDate(s: string | undefined): string | undefined {
  if (!s) return s;
  return DATE.exec(s)?.[0] ?? s;
}

const F = {
  id: [/^manuscript id$/, /^manuscript #$/, /^id$/],
  title: [/^title$/, /^manuscript title$/],
  status: [/^manuscript status$/, /^status$/, /^current status$/],
  type: [/^manuscript type$/, /^article type$/, /^type$/],
  submitted: [/^date submitted$/, /^submitted$/, /^submission date$/, /^original submission/],
  authors: [/^authors?$/, /^author\(s\)$/, /^submitting author$/, /^contributing authors?$/],
  handlingEditor: [/^ae$/, /^associate editor$/, /^handling editor$/, /^editor$/],
};

export function extractManuscript(doc: Document, idPattern?: string): Extracted<ManuscriptDetails | undefined> {
  const strategies: Record<string, string> = {};
  const warnings: string[] = [];
  const fields = labeledValues(doc.body);

  const take = (k: keyof typeof F): string | undefined => {
    const hit = pick(fields, F[k]);
    if (hit) {
      strategies[k] = `label "${hit[0]}"`;
      return truncate(hit[1], 500);
    }
    return undefined;
  };

  let ref = null;
  const idField = take('id');
  if (idField) ref = parseManuscriptId(idField, idPattern);
  if (!ref) {
    const crumbs = breadcrumb(doc);
    const last = crumbs?.[crumbs.length - 1];
    if (last && /^details for\b/i.test(last)) ref = parseManuscriptId(last, idPattern);
    if (ref) strategies.id = 'breadcrumb';
  }
  if (!ref) {
    // Fall back to the most frequent manuscript, at its highest revision.
    const ids = findManuscriptIds(textOf(doc.body), idPattern);
    const byBase = new Map<string, number>();
    for (const m of ids) byBase.set(m.baseId, (byBase.get(m.baseId) ?? 0) + m.count);
    const base = [...byBase].sort((a, b) => b[1] - a[1])[0]?.[0];
    const top = ids.filter((m) => m.baseId === base).sort((a, b) => b.revision - a.revision)[0];
    if (top) {
      ref = { id: top.id, baseId: top.baseId, revision: top.revision };
      strategies.id = 'most frequent id';
    }
  }
  if (!ref) return { value: undefined, strategies, warnings: ['manuscript: no manuscript id'] };

  let title = take('title');
  if (title && looksLikeLabel(title)) {
    warnings.push(`manuscript: rejected title "${truncate(title, 40)}" (looks like a label)`);
    title = undefined;
  }
  if (!title) {
    // Title often sits right after the ID in a heading.
    const h = Array.from(doc.querySelectorAll('h1,h2,h3,b,strong'))
      .map((e) => textOf(e))
      .find((t) => t.includes(ref!.baseId) && t.length > ref!.id.length + 10);
    if (h) {
      title = normalize(h.replace(ref.id, '').replace(/^[\s:–—-]+/, ''));
      strategies.title = 'heading next to id';
    }
  }
  if (!title) {
    // Newer layout: the ID on its own line, the title on the next one.
    const idEl = Array.from(doc.querySelectorAll('strong,b,span,div,li,td,h1,h2,h3,h4'))
      .find((e) => textOf(e) === ref!.id && e.children.length <= 1);
    const item = idEl?.closest('li,tr,p,div');
    let next = item?.nextElementSibling;
    for (let i = 0; next && i < 3; i++, next = next.nextElementSibling) {
      const t = textOf(next);
      if (!t) continue;
      if (t.length > 8 && t.length < 400 && !findManuscriptIds(t, idPattern).length && !looksLikeLabel(t)) {
        title = t;
        strategies.title = 'line after id';
      }
      break;
    }
  }
  if (!title) warnings.push('manuscript: no title');

  const value: ManuscriptDetails = {
    ...ref,
    title,
    status: take('status'),
    type: take('type'),
    submitted: firstDate(take('submitted')),
    authors: take('authors'),
    handlingEditor: take('handlingEditor'),
    reviewers: extractReviewers(doc, strategies, warnings),
    fields: Object.fromEntries([...fields].slice(0, 80).map(([k, v]) => [k, truncate(v, 300)])),
  };
  return { value, strategies, warnings };
}

const REVIEWER_HEADER = /reviewer|name/;
const REVIEWER_STATUS = /\b(invited|agreed|declined|completed|overdue|scores? (returned|received)|un-?invited|selected|alternate|review (due|submitted))\b/i;

function extractReviewers(doc: Document, strategies: Record<string, string>, warnings: string[]): Person[] {
  // Strategy 1: a table whose headers include reviewer/name and status.
  let reviewerTable = false;
  for (const t of dataTables(doc)) {
    const nameCol = t.headers.findIndex((h) => REVIEWER_HEADER.test(h));
    const statusCol = t.headers.findIndex((h) => /status|response/.test(h));
    if (nameCol < 0 || statusCol < 0) continue;
    reviewerTable = true;
    const people: Person[] = [];
    for (const r of t.rows) {
      const name = textOf(r[nameCol]);
      if (!name || name.length > 120) continue;
      const dates: Record<string, string> = {};
      r.forEach((c, i) => {
        const h = t.headers[i];
        const v = textOf(c);
        if (h && /date|due|invited|agreed|returned|submitted/.test(h) && v) dates[h] = v;
      });
      people.push({ name, role: 'reviewer', status: textOf(r[statusCol]) || undefined, dates });
    }
    if (people.length) {
      strategies.reviewers = 'reviewer table';
      return people;
    }
  }
  // Strategy 2: rows under a "Reviewer List" label with a status word.
  const anchor = Array.from(doc.querySelectorAll('td,th,b,strong,span,h2,h3,h4,div'))
    .find((e) => /^reviewer list$|^reviewers$/.test(labelKey(textOf(e))) && e.children.length <= 2);
  if (anchor) {
    const scope = anchor.closest('table') ?? anchor.parentElement;
    const people: Person[] = [];
    for (const tr of Array.from(scope?.querySelectorAll('tr') ?? [])) {
      if (isLayoutRow(tr)) continue;
      const t = textOf(tr);
      const st = REVIEWER_STATUS.exec(t);
      if (!st) continue;
      const first = textOf(tr.children[0] ?? null);
      if (first && first.length < 120) people.push({ name: first, role: 'reviewer', status: st[0] });
    }
    if (people.length) {
      strategies.reviewers = 'rows under reviewer list';
      return people;
    }
  }
  // Strategy 3 (newer layout): a "Reviews" panel listing each reviewer's
  // name as a link, followed by their recommendation.
  const panel = Array.from(doc.querySelectorAll('div,th,td,h2,h3,h4,span'))
    .find((e) => /^reviews$/.test(labelKey(textOf(e))) && e.children.length === 0);
  if (panel) {
    const scope = panel.parentElement;
    const people: Person[] = [];
    for (const a of Array.from(scope?.querySelectorAll('a') ?? [])) {
      const name = textOf(a);
      if (!/^[^,]{2,60}, [^,]{1,60}$/.test(name)) continue;
      const after = a.nextElementSibling;
      const status = after ? textOf(after.querySelector('li') ?? after).replace(/\bview review\b.*$/i, '').trim() : '';
      people.push({ name, role: 'reviewer', status: status || undefined });
    }
    if (people.length) {
      strategies.reviewers = 'reviews panel';
      return people;
    }
  }
  // Warn only when a reviewer section was there but nothing came out of it;
  // the word alone turns up in note titles ("awaiting reviewer assignment").
  if (reviewerTable || anchor || panel) warnings.push('manuscript: reviewers mentioned but not parsed');
  strategies.reviewers = 'none';
  return [];
}
