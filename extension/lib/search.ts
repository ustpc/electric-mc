// Opening a manuscript by ID through MC's own search: the search bar under
// the breadcrumb (a field type dropdown, a text box and a Search button).
// Running a search reloads the page, so "then press Take Action" is carried
// across the reload in sessionStorage, which is per tab.

import { parseManuscriptId } from './ids';
import { labelKey, textOf } from './text';
import { pageClick } from './click';

const PENDING = 'emc-open-manuscript';
const PENDING_MS = 60_000;

const isSearchButton = (el: Element) =>
  /^search$/i.test(((el as HTMLInputElement).value || textOf(el)).trim()) && !el.closest('.breadcrumb, ol, nav ul');

export interface SearchForm {
  input: HTMLInputElement;
  button: HTMLElement;
}

/** The manuscript search box and its Search button. */
export function findSearchForm(doc: Document): SearchForm | null {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>('button, input[type=submit], input[type=button], a.btn')).filter(isSearchButton);
  for (const button of candidates) {
    // The text box is the nearest one before the button. The "+ Search"
    // toggle in the breadcrumb bar has none before it, so it's passed over.
    let scope: Element | null = button.parentElement;
    for (let i = 0; scope && i < 4; i++, scope = scope.parentElement) {
      const boxes = Array.from(scope.querySelectorAll<HTMLInputElement>('input[type=text], input[type=search], input:not([type])')).filter(
        (b) => b.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      const input = boxes[boxes.length - 1];
      if (input) return { input, button };
    }
  }
  return null;
}

/** Pick "Manuscript ID" as the search field, if the bar offers a choice. */
function chooseManuscriptId(doc: Document, form: SearchForm) {
  const bar = form.button.closest('form, div, td') ?? doc.body;
  const select = bar.querySelector<HTMLSelectElement>('select');
  const opt = select && Array.from(select.options).find((o) => labelKey(o.text) === 'manuscript id');
  if (select && opt) {
    select.value = opt.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  // Bootstrap-style dropdown: click its "Manuscript ID" item unless already chosen.
  const toggle = bar.querySelector<HTMLElement>('.dropdown-toggle, [data-toggle=dropdown], [data-bs-toggle=dropdown]');
  if (toggle && labelKey(textOf(toggle)) !== 'manuscript id') {
    const items = [...bar.querySelectorAll<HTMLElement>('.dropdown-menu a, [role=menuitem]'), ...bar.querySelectorAll<HTMLElement>('.dropdown-menu li')];
    const item = items.find((a) => labelKey(textOf(a)) === 'manuscript id');
    if (item) pageClick(item);
  }
}

/** Search MC for a manuscript ID; Take Action follows on the results page. */
export function openManuscript(doc: Document, id: string): boolean {
  const form = findSearchForm(doc);
  if (!form) return false;
  chooseManuscriptId(doc, form);
  form.input.value = id;
  form.input.dispatchEvent(new Event('input', { bubbles: true }));
  form.input.dispatchEvent(new Event('change', { bubbles: true }));
  try {
    doc.defaultView?.sessionStorage.setItem(PENDING, JSON.stringify({ id, at: Date.now() }));
  } catch {
    /* storage blocked: the search still runs */
  }
  pageClick(form.button);
  return true;
}

/** The ID we searched for from the side panel, if that was moments ago. Clears it. */
export function takePending(doc: Document): string | null {
  try {
    const s = doc.defaultView?.sessionStorage;
    const raw = s?.getItem(PENDING);
    if (!raw) return null;
    s!.removeItem(PENDING);
    const p = JSON.parse(raw) as { id: string; at: number };
    return Date.now() - p.at < PENDING_MS ? p.id : null;
  } catch {
    return null;
  }
}

/**
 * On a search results page listing exactly one manuscript, its Take Action
 * link. Null for anything else, so we never act on a choice.
 */
export function singleResultAction(doc: Document, idPattern?: string): { id: string; action: HTMLElement } | null {
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.rows).filter((tr) => tr.closest('table') === table);
    const h = rows.findIndex((tr) => Array.from(tr.cells).some((c) => labelKey(textOf(c)) === 'take action'));
    if (h < 0) continue;
    const header = rows[h]!;
    const col = Array.from(header.cells).findIndex((c) => labelKey(textOf(c)) === 'take action');
    // Rows below the header only: a "Search Criteria" line above it quotes the ID too.
    const hits = rows
      .slice(h + 1)
      .map((tr) => ({ tr, ref: parseManuscriptId(textOf(tr.cells[0] ?? null), idPattern) }))
      .filter((x) => x.ref);
    if (new Set(hits.map((x) => x.ref!.id)).size !== 1) continue;
    for (const { tr, ref } of hits) {
      const cell = tr.cells[col] ?? tr.cells[tr.cells.length - 1];
      const action = cell?.querySelector<HTMLElement>('a, button, input[type=image]');
      if (action) return { id: ref!.id, action };
    }
  }
  return null;
}
