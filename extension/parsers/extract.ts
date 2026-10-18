// Field extraction for each page type. Every extractor tries more than one
// strategy and records which one worked in `strategies`, so a log from a user
// whose page changed shows which fallback kicked in.

import { findManuscriptIds, parseManuscriptId } from '../lib/ids';
import { labelKey, normalize, textOf, truncate } from '../lib/text';
import { queueEntries } from './classify';
import { dataTables, labeledValues, pick, type SimpleTable } from './dom';
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

    let title = idx.title >= 0 ? texts[idx.title] : undefined;
    if (title && idx.title === idx.id) title = title.replace(ref.id, '').trim() || undefined;
    if (title) strategies.title ??= 'title column';
    if (!title) {
      // Longest text cell that isn't the ID cell or a date is probably the title.
      title = texts
        .filter((t) => !t.includes(ref!.baseId) && !/^\d/.test(t) && t.length > 15)
        .sort((a, b) => b.length - a.length)[0];
      if (title) strategies.title = 'longest cell';
    }
    const status = idx.status >= 0 ? texts[idx.status] : undefined;
    rows.push({ ...ref, title: title ? truncate(title, 300) : undefined, status: status || undefined, cells: rec });
  }
  if (!rows.length) warnings.push('queue list: rows found but no ids parsed');
  return { value: rows, strategies, warnings };
}

// ---------- manuscript page ----------

const F = {
  id: [/^manuscript id$/, /^manuscript #$/, /^id$/],
  title: [/^title$/, /^manuscript title$/],
  status: [/^manuscript status$/, /^status$/, /^current status$/],
  type: [/^manuscript type$/, /^article type$/, /^type$/],
  submitted: [/^date submitted$/, /^submitted$/, /^submission date$/, /^original submission/],
  authors: [/^authors?$/, /^author\(s\)$/, /^submitting author$/, /^contributing authors?$/],
  handlingEditor: [/^associate editor$/, /^handling editor$/, /^editor$/, /^ae$/],
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
    // Fall back to the most frequent ID on the page.
    const ids = findManuscriptIds(textOf(doc.body), idPattern).sort((a, b) => b.count - a.count);
    if (ids[0]) {
      ref = { id: ids[0].id, baseId: ids[0].baseId, revision: ids[0].revision };
      strategies.id = 'most frequent id';
    }
  }
  if (!ref) return { value: undefined, strategies, warnings: ['manuscript: no manuscript id'] };

  let title = take('title');
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
  if (!title) warnings.push('manuscript: no title');

  const value: ManuscriptDetails = {
    ...ref,
    title,
    status: take('status'),
    type: take('type'),
    submitted: take('submitted'),
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
  for (const t of dataTables(doc)) {
    const nameCol = t.headers.findIndex((h) => REVIEWER_HEADER.test(h));
    const statusCol = t.headers.findIndex((h) => /status|response/.test(h));
    if (nameCol < 0 || statusCol < 0) continue;
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
      if (tr.querySelector('table')) continue;
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
  if (/\breviewer\b/i.test(textOf(doc.body))) warnings.push('manuscript: reviewers mentioned but not parsed');
  strategies.reviewers = 'none';
  return [];
}
