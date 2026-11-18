// One-button reject, for a co-chair who rejects a paper without sending it
// out. MC's CACM workflow only lets the paper leave the Assign AE queue
// through an AE's recommendation, so the co-chair assigns the paper to the
// AE account of the login they're using, recommends Reject as that AE, then
// makes the co-chair recommendation. This does the clicking. Next to MC's
// Assign button we add "| [ ] reject [one-button reject]"; the button works
// only once the PDF has been opened on this visit to the paper and the box
// is checked. Pressing it assigns the paper to the logged-in person's AE
// entry, switches to the AE center, opens the paper by search, sets the
// reviewers needed to 0 when MC shows such a field, opens Make
// Recommendation, picks Reject and puts the cursor in the comments. The
// person writes the comments and presses Submit. Then it switches back to the
// Co-Chair Center, opens the paper, opens the co-chair recommendation, picks
// Reject, copies both comment boxes and presses Submit. Every step happens
// in the visible tab, one page at a time; the state is in sessionStorage
// (this tab only). Anything unexpected stops the run and says why in the
// banner.

import { pageClick } from './click';
import { findAeSelect, mcText, parseOption } from './aeload';
import { taskLinks } from './advance';
import { EMC_COLOR } from './milestones';
import { labelKey, textOf } from './text';
import type { McIdentity } from './identity';

export type Step = 'assigned' | 'ae-center' | 'ae-details' | 'ae-form' | 'ae-sent' | 'cc-center' | 'cc-details' | 'cc-sent';

export interface RunState {
  id: string;
  step: Step;
  /** When the run started; a run older than RUN_MS is dropped. */
  at: number;
  /** The AE entry we assigned, as MC names it ("Last, First"). */
  ae: string;
  /** Task-link presses on the current step, so a page that won't open can't loop. */
  tries?: number;
  toAuthor?: string;
  toEditor?: string;
  /** Set when the reviewers-needed field was found and set. */
  reviewers?: 'set' | 'not found';
}

const STATE = 'emc-one-button';
const PDF = 'emc-one-button-pdf';
const RUN_MS = 30 * 60_000;
const UI = 'one-button';
const BANNER = 'one-button-banner';

// ---------- storage ----------

function store(doc: Document): Storage | null {
  try {
    return doc.defaultView?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readRun(doc: Document): RunState | null {
  try {
    const raw = store(doc)?.getItem(STATE);
    const s = raw ? (JSON.parse(raw) as RunState) : null;
    if (s && Date.now() - s.at > RUN_MS) {
      writeRun(doc, null);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function writeRun(doc: Document, s: RunState | null): void {
  try {
    if (s) store(doc)?.setItem(STATE, JSON.stringify(s));
    else store(doc)?.removeItem(STATE);
  } catch {
    /* storage blocked */
  }
}

/** Note that the PDF was opened on this visit to manuscript `id`. */
export function notePdfViewed(doc: Document, id: string): void {
  try {
    store(doc)?.setItem(PDF, id);
  } catch {
    /* storage blocked */
  }
}

export function pdfViewed(doc: Document, id: string | undefined): boolean {
  try {
    return !!id && store(doc)?.getItem(PDF) === id;
  } catch {
    return false;
  }
}

/** On each page: leaving the paper (another paper, or a page that isn't a paper) forgets the PDF. */
export function forgetPdfUnless(doc: Document, id: string | undefined): void {
  try {
    if (store(doc)?.getItem(PDF) !== id) store(doc)?.removeItem(PDF);
  } catch {
    /* storage blocked */
  }
}

/** A press on a link that opens the manuscript's PDF. */
export function isPdfLink(target: EventTarget | null): boolean {
  const a = target instanceof Element ? target.closest('a') : null;
  if (!a || a.closest('[data-electric-mc]')) return false;
  const t = labelKey(textOf(a));
  return t === 'pdf' || /^(view )?pdf\b/.test(t) || /\.pdf\b|pdf_proof|\bpdf\b/i.test(`${a.getAttribute('href') ?? ''} ${a.getAttribute('onclick') ?? ''}`);
}

// ---------- page pieces ----------

/** MC's Assign button next to the AE pull-down. */
export function findAssignButton(select: HTMLSelectElement): HTMLElement | null {
  const scope = select.closest('tr') ?? select.parentElement;
  if (!scope) return null;
  const all = Array.from(scope.querySelectorAll<HTMLElement>('a, button, input[type=button], input[type=submit], input[type=image], img'));
  const hit = all.find((e) => {
    if (e.closest('[data-electric-mc]')) return false;
    const words = `${textOf(e)} ${e.getAttribute('value') ?? ''} ${e.getAttribute('alt') ?? ''} ${e.getAttribute('title') ?? ''} ${(e.getAttribute('src') ?? '').split('/').pop()}`;
    return /\bassign\b/i.test(words) && !/view details/i.test(words);
  });
  return hit ? (hit.tagName === 'IMG' ? (hit.closest<HTMLElement>('a, button') ?? hit) : hit) : null;
}

/** "Last, First" for the logged-in person, as MC's pull-down writes names. */
export function aeNameFor(id: McIdentity): { first: string; last: string } | null {
  return id.firstName && id.lastName ? { first: fold(id.firstName), last: fold(id.lastName) } : null;
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The pull-down option for the logged-in person: exactly one "Last, First (n)" match. */
export function ownOption(select: HTMLSelectElement, who: McIdentity): HTMLOptionElement | null {
  const name = aeNameFor(who);
  if (!name) return null;
  const hits = Array.from(select.options).filter((o) => {
    const e = parseOption(mcText(o));
    if (!e) return false;
    const [last, first] = e.name.split(',').map((x) => fold(x));
    return last === name.last && (first ?? '').startsWith(name.first);
  });
  return hits.length === 1 ? hits[0]! : null;
}

/** The radio button whose row says Reject (not "Reject & Resubmit"), if exactly one. */
export function rejectRadio(doc: Document): HTMLInputElement | null {
  const hits = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type=radio]')).filter((r) => {
    const row = r.closest('tr');
    const t = row ? labelKey(textOf(row)) : '';
    return /^(immediate )?reject\b/.test(t) && !/resubmit|revis/.test(t) && t.length < 40;
  });
  return hits.length === 1 ? hits[0]! : null;
}

/** The comment boxes of a recommendation form. */
export function commentBoxes(doc: Document): { toAuthor: HTMLTextAreaElement | null; toEditor: HTMLTextAreaElement | null } {
  const boxes = Array.from(doc.querySelectorAll<HTMLTextAreaElement>('textarea'));
  return {
    toAuthor: boxes.find((t) => /COMMENTS_TO_AUTHOR$/i.test(t.name)) ?? null,
    toEditor: boxes.find((t) => /COMMENTS_TO_EDITOR$/i.test(t.name)) ?? null,
  };
}

/** The Submit control of a "… Recommends" form. */
export function recommendSubmit(doc: Document): HTMLElement | null {
  const hasHeading = Array.from(doc.querySelectorAll('th, td, div, span, b, h2, h3, h4')).some(
    (e) => e.children.length <= 2 && textOf(e).length < 60 && /recommends$/.test(labelKey(textOf(e))),
  );
  if (!hasHeading) return null;
  const subs = Array.from(doc.querySelectorAll<HTMLElement>('a, button, input[type=submit], input[type=button]')).filter(
    (e) => !e.closest('[data-electric-mc]') && labelKey(textOf(e) || e.getAttribute('value') || '') === 'submit',
  );
  return subs.length === 1 ? subs[0]! : null;
}

/** A link to a role's center ("Associate Editor Center", "Co-Chair Center"). */
export function centerLink(doc: Document, role: 'ae' | 'cc'): HTMLElement | null {
  const re = role === 'ae' ? /^associate editor center$/ : /^co-?chair center$/;
  return Array.from(doc.querySelectorAll<HTMLElement>('a')).find((a) => re.test(labelKey(textOf(a)))) ?? null;
}

/** The task link for this step: the AE's Make Recommendation, or the co-chair's. */
export function recommendTask(doc: Document, role: 'ae' | 'cc'): HTMLElement | null {
  for (const [name, link] of taskLinks(doc)) {
    if (role === 'cc' && /co-?chair/.test(name) && /recommend/.test(name)) return link;
    if (role === 'ae' && name === 'make recommendation') return link;
  }
  return null;
}

/**
 * MC's "reviewers needed" field, when the page has one: a pull-down or text
 * box in a row that talks about the number of reviewers.
 */
export function reviewersField(doc: Document): HTMLSelectElement | HTMLInputElement | null {
  for (const f of Array.from(doc.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input[type=text], input:not([type])'))) {
    const row = f.closest('tr') ?? f.parentElement;
    const ctx = labelKey(`${row ? textOf(row) : ''} ${f.name} ${f.id}`);
    if (/(number of reviewers|reviewers? (required|needed)|required reviewers|minimum reviewers|num_?rev)/.test(ctx)) return f;
  }
  return null;
}

/** Set the reviewers-needed field to 0. True when it was there and now says 0. */
export function setReviewersToZero(doc: Document): boolean {
  const f = reviewersField(doc);
  if (!f) return false;
  if (f instanceof HTMLSelectElement) {
    const zero = Array.from(f.options).find((o) => o.text.trim() === '0' || o.value === '0');
    if (!zero) return false;
    f.value = zero.value;
  } else {
    f.value = '0';
  }
  f.dispatchEvent(new Event('input', { bubbles: true }));
  f.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function fill(box: HTMLTextAreaElement | null, text: string | undefined) {
  if (!box || text === undefined) return;
  box.value = text;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------- the controls next to Assign ----------

/**
 * Put "| [ ] reject [one-button reject]" after MC's Assign button. `ready`
 * says whether the PDF was opened; `start` runs when the button is pressed.
 */
export function addControls(doc: Document, ready: boolean, start: () => void): boolean {
  const found = findAeSelect(doc);
  const assign = found && findAssignButton(found.select);
  const old = doc.querySelector<HTMLElement>(`[data-electric-mc="${UI}"]`);
  if (!assign) {
    old?.remove();
    return false;
  }
  if (old) {
    refreshControls(doc, ready);
    return true;
  }
  const wrap = doc.createElement('span');
  wrap.setAttribute('data-electric-mc', UI);
  wrap.style.cssText = `margin-left:8px;white-space:nowrap;color:${EMC_COLOR}`;
  wrap.innerHTML = `<span style="margin:0 6px;color:#999">|</span><label style="cursor:pointer"><input type="checkbox" data-ob="arm"> reject</label> <button type="button" data-ob="go" disabled>one-button reject</button>`;
  assign.insertAdjacentElement('afterend', wrap);
  const box = wrap.querySelector<HTMLInputElement>('[data-ob="arm"]')!;
  const go = wrap.querySelector<HTMLButtonElement>('[data-ob="go"]')!;
  box.addEventListener('change', () => refreshControls(doc, wrap.getAttribute('data-ready') === '1'));
  go.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!go.disabled) start();
  });
  refreshControls(doc, ready);
  return true;
}

export function refreshControls(doc: Document, ready: boolean): void {
  const wrap = doc.querySelector<HTMLElement>(`[data-electric-mc="${UI}"]`);
  if (!wrap) return;
  wrap.setAttribute('data-ready', ready ? '1' : '0');
  const armed = wrap.querySelector<HTMLInputElement>('[data-ob="arm"]')!.checked;
  const go = wrap.querySelector<HTMLButtonElement>('[data-ob="go"]')!;
  go.disabled = !(ready && armed);
  go.title = !ready ? 'Open the PDF first (on this visit to the paper).' : !armed ? 'Check "reject" first.' : 'Assign to your AE account, recommend Reject as AE, then as co-chair.';
}

// ---------- banner ----------

export function showBanner(doc: Document, text: string, kind: 'run' | 'stop' | 'done', onCancel?: () => void): void {
  let b = doc.querySelector<HTMLElement>(`[data-electric-mc="${BANNER}"]`);
  if (!b) {
    b = doc.createElement('div');
    b.setAttribute('data-electric-mc', BANNER);
    doc.documentElement.appendChild(b);
  }
  const color = kind === 'stop' ? '#b91c1c' : kind === 'done' ? '#15803d' : EMC_COLOR;
  b.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fff7ed;border-bottom:3px solid ${color};color:${color};font:600 15px system-ui,sans-serif;padding:8px 14px;text-align:center`;
  b.textContent = text;
  if (onCancel) {
    const x = doc.createElement('button');
    x.type = 'button';
    x.textContent = 'Stop';
    x.style.cssText = 'margin-left:12px';
    x.addEventListener('click', onCancel);
    b.appendChild(x);
  }
  if (kind !== 'run') setTimeout(() => b?.remove(), kind === 'done' ? 6000 : 30000);
}

export function hideBanner(doc: Document): void {
  doc.querySelector(`[data-electric-mc="${BANNER}"]`)?.remove();
}

// ---------- the run ----------

export interface Page {
  /** The manuscript on screen, on a details page. */
  manuscript?: string;
  isDetails: boolean;
}

export interface Hooks {
  openBySearch: (id: string) => boolean;
  log: (event: string, data?: unknown) => void;
}

/** Start: pick the person's own AE and press Assign. Returns why not, or null. */
export function startRun(doc: Document, id: string, who: McIdentity | null): string | null {
  const found = findAeSelect(doc);
  if (!found) return "MC's AE pull-down isn't on this page.";
  if (!who) return "MC didn't say who is logged in.";
  const opt = ownOption(found.select, who);
  if (!opt) return `No single entry for ${who.lastName ?? '?'}, ${who.firstName ?? '?'} in the AE pull-down.`;
  const assign = findAssignButton(found.select);
  if (!assign) return "MC's Assign button isn't on this page.";
  found.select.value = opt.value;
  found.select.dispatchEvent(new Event('change', { bubbles: true }));
  writeRun(doc, { id, step: 'assigned', at: Date.now(), ae: mcText(opt).replace(/\s*\(.*$/, '') });
  pageClick(assign);
  return null;
}

const LABEL: Record<Step, string> = {
  assigned: 'assigning the paper to your AE account',
  'ae-center': 'switching to the Associate Editor Center',
  'ae-details': 'opening Make Recommendation as AE',
  'ae-form': 'write your comments, then press Submit',
  'ae-sent': 'switching back to the Co-Chair Center',
  'cc-center': 'opening the paper as co-chair',
  'cc-details': 'filling in and submitting the co-chair recommendation',
  'cc-sent': 'finishing',
};

export function bannerText(s: RunState): string {
  return `One-button reject mode (${s.id}): ${LABEL[s.step]}.`;
}

/** Stop the run and say why. */
export function stopRun(doc: Document, s: RunState, why: string, hooks: Hooks): void {
  writeRun(doc, null);
  hooks.log('one-button reject stopped', { step: s.step, why });
  showBanner(doc, `One-button reject stopped (${s.id}): ${why} Nothing more will be done; carry on by hand.`, 'stop');
}

/**
 * On each page load: carry out the run's next step. `aeName` is the AE on
 * the paper's details page, when it shows one.
 */
export function stepRun(doc: Document, page: Page, aeName: string | undefined, hooks: Hooks): void {
  const s = readRun(doc);
  if (!s) return;
  const cancel = () => {
    writeRun(doc, null);
    hooks.log('one-button reject cancelled', { step: s.step });
    hideBanner(doc);
  };
  const next = (step: Step, extra: Partial<RunState> = {}) => {
    const n: RunState = { ...s, ...extra, step, tries: 0 };
    writeRun(doc, n);
    hooks.log('one-button reject step', { step });
    showBanner(doc, bannerText(n), 'run', cancel);
    return n;
  };
  showBanner(doc, bannerText(s), 'run', cancel);
  const wrongPaper = page.isDetails && page.manuscript && page.manuscript !== s.id;

  switch (s.step) {
    case 'assigned': {
      // MC may show a page or two in between (an e-mail step); give it three loads.
      const shown = page.isDetails && !wrongPaper && !!aeName && fold(aeName).replace(/\s/g, '').includes(fold(s.ae).replace(/\s/g, ''));
      if (!shown) {
        if ((s.tries ?? 0) >= 2) return stopRun(doc, s, page.isDetails ? `the paper doesn't show ${s.ae} as AE.` : "MC didn't come back to the paper after Assign.", hooks);
        writeRun(doc, { ...s, tries: (s.tries ?? 0) + 1 });
        return;
      }
      const link = centerLink(doc, 'ae');
      if (!link) return stopRun(doc, s, 'no link to the Associate Editor Center.', hooks);
      next('ae-center');
      pageClick(link);
      return;
    }
    case 'ae-center':
    case 'cc-center': {
      if (page.isDetails) return; // the search is still landing
      const n = next(s.step === 'ae-center' ? 'ae-details' : 'cc-details');
      if (!hooks.openBySearch(s.id)) stopRun(doc, n, "MC's search box isn't on this page.", hooks);
      return;
    }
    case 'ae-details':
    case 'cc-details': {
      if (!page.isDetails) return; // search results; Take Action follows
      if (wrongPaper) return stopRun(doc, s, `MC opened ${page.manuscript} instead.`, hooks);
      const role = s.step === 'ae-details' ? 'ae' : 'cc';
      const reject = rejectRadio(doc);
      const submit = recommendSubmit(doc);
      if (reject && submit) {
        pageClick(reject);
        const boxes = commentBoxes(doc);
        if (role === 'ae') {
          next('ae-form');
          const box = boxes.toAuthor ?? boxes.toEditor;
          box?.focus();
          box?.scrollIntoView?.({ block: 'center' });
          return;
        }
        fill(boxes.toAuthor, s.toAuthor);
        fill(boxes.toEditor, s.toEditor);
        next('cc-sent');
        // Let MC's own handlers see the choice and text before Submit.
        setTimeout(() => pageClick(submit), 600);
        return;
      }
      if ((s.tries ?? 0) >= 2) return stopRun(doc, s, `couldn't find the Recommends form with a Reject choice.`, hooks);
      let reviewers = s.reviewers;
      if (role === 'ae' && !reviewers) {
        reviewers = setReviewersToZero(doc) ? 'set' : 'not found';
        hooks.log('one-button reject reviewers', { reviewers });
      }
      const task = recommendTask(doc, role);
      if (!task) return stopRun(doc, s, `no ${role === 'ae' ? 'Make Recommendation' : 'co-chair recommendation'} task on the paper.`, hooks);
      writeRun(doc, { ...s, reviewers, tries: (s.tries ?? 0) + 1 });
      pageClick(task);
      return;
    }
    case 'ae-form':
      // Waiting for the person's Submit (see noteAeSubmit).
      return;
    case 'ae-sent': {
      const link = centerLink(doc, 'cc');
      if (!link) return stopRun(doc, s, 'no link to the Co-Chair Center.', hooks);
      next('cc-center');
      pageClick(link);
      return;
    }
    case 'cc-sent': {
      writeRun(doc, null);
      hooks.log('one-button reject done', {});
      showBanner(doc, `One-button reject done (${s.id}): rejected as AE and as co-chair.`, 'done');
      return;
    }
  }
}

/**
 * The person's Submit on the AE form, after the page's guards let it
 * through. Keeps the comments for the co-chair step; a choice other than
 * Reject ends the run.
 */
export function noteAeSubmit(doc: Document, hooks: Hooks): void {
  const s = readRun(doc);
  if (!s || s.step !== 'ae-form') return;
  const reject = rejectRadio(doc);
  if (!reject?.checked) return stopRun(doc, s, 'you picked something other than Reject.', hooks);
  const boxes = commentBoxes(doc);
  writeRun(doc, { ...s, step: 'ae-sent', tries: 0, toAuthor: boxes.toAuthor?.value, toEditor: boxes.toEditor?.value });
  hooks.log('one-button reject step', { step: 'ae-sent' });
  // Our own next page is the Co-Chair Center, not the next paper. Auto-advance
  // notes the press in a listener that may run after this one, so clear again
  // once every listener has run.
  const clear = () => {
    try {
      store(doc)?.removeItem('emc-advance');
      store(doc)?.removeItem('emc-carry-task');
    } catch {
      /* storage blocked */
    }
  };
  clear();
  setTimeout(clear, 0);
}
