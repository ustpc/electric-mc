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
import { isShown } from './shown';
import { findAeSelect, mcText, parseOption } from './aeload';
import { cancelAdvance, taskLinks } from './advance';
import { EMC_COLOR } from './ui';
import { commentBoxes, recommendsRole } from './recommendform';
import { tabGet, tabSet } from './tabstate';
import { foldName, labelKey, textOf } from './text';
import type { McIdentity } from './identity';

export type Step = 'assigned' | 'ae-center' | 'ae-details' | 'ae-form' | 'ae-sent' | 'cc-center' | 'cc-details' | 'cc-sent' | 'info-tab';

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
  reviewers?: 'set' | 'saved' | 'not found';
}

const RUN_MS = 2 * 60 * 60_000;
const UI = 'one-button';
const BANNER = 'one-button-banner';

// ---------- storage ----------

export function readRun(doc: Document): RunState | null {
  const s = tabGet<RunState>(doc, 'oneButton');
  if (s && Date.now() - s.at > RUN_MS) {
    writeRun(doc, null);
    return null;
  }
  return s;
}

export function writeRun(doc: Document, s: RunState | null): void {
  tabSet(doc, 'oneButton', s);
}

/** Note that the PDF was opened on this visit to manuscript `id`. */
export function notePdfViewed(doc: Document, id: string): void {
  tabSet(doc, 'oneButtonPdf', id);
}

export function pdfViewed(doc: Document, id: string | undefined): boolean {
  return !!id && tabGet<string>(doc, 'oneButtonPdf') === id;
}

/** On each page: leaving the paper (another paper, or a page that isn't a paper) forgets the PDF. */
export function forgetPdfUnless(doc: Document, id: string | undefined): void {
  if (tabGet<string>(doc, 'oneButtonPdf') !== id) tabSet(doc, 'oneButtonPdf', null);
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
  // Usually in the pull-down's own table row; on some pages MC puts it in the
  // next cell of an enclosing table, so look a few rows out, nearest first.
  // Each enclosing table row in turn (at most three), then the parent element.
  let scope: Element | null = select.closest('tr') ?? select.parentElement;
  for (let i = 0; scope && i < 3; i++, scope = scope.parentElement?.closest('tr') ?? null) {
    const hit = assignIn(scope);
    if (hit) return hit;
  }
  return null;
}

function assignIn(scope: Element): HTMLElement | null {
  const all = Array.from(scope.querySelectorAll<HTMLElement>('a, button, input[type=button], input[type=submit], input[type=image], img'));
  const hit = all.find((e) => {
    if (e.closest('[data-electric-mc]')) return false;
    const words = `${textOf(e)} ${e.getAttribute('value') ?? ''} ${e.getAttribute('alt') ?? ''} ${e.getAttribute('title') ?? ''} ${(e.getAttribute('src') ?? '').split('/').pop()}`;
    return /\bassign\b/i.test(words) && !/view details|reviewer/i.test(words);
  });
  return hit ? (hit.tagName === 'IMG' ? (hit.closest<HTMLElement>('a, button') ?? hit) : hit) : null;
}

/** "Last, First" for the logged-in person, as MC's pull-down writes names. */
export function aeNameFor(id: McIdentity): { first: string; last: string } | null {
  return id.firstName && id.lastName ? { first: foldName(id.firstName), last: foldName(id.lastName) } : null;
}


/** The pull-down option for the logged-in person: exactly one "Last, First (n)" match. */
export function ownOption(select: HTMLSelectElement, who: McIdentity): HTMLOptionElement | null {
  const name = aeNameFor(who);
  if (!name) return null;
  const hits = Array.from(select.options).filter((o) => {
    const e = parseOption(mcText(o));
    if (!e) return false;
    const [last, first] = e.name.split(',').map((x) => foldName(x));
    return last === name.last && (first ?? '').startsWith(name.first);
  });
  return hits.length === 1 ? hits[0]! : null;
}

/** The radio button whose row says Reject (not "Reject & Resubmit"), if exactly one. */
export function rejectRadio(doc: Document): HTMLInputElement | null {
  const hits = rejectRadios(doc).filter((r) => isShown(r));
  return hits.length === 1 ? hits[0]! : null;
}

/** Every Reject radio on the page, shown or not. */
function rejectRadios(doc: Document): HTMLInputElement[] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type=radio]')).filter((r) => {
    const row = r.closest('tr');
    const t = row ? labelKey(textOf(row)) : '';
    return /^(immediate )?reject\b/.test(t) && !/resubmit|revis/.test(t) && t.length < 40;
  });
}

/**
 * The Submit control of the role's "… Recommends" form: the co-chair's form
 * must say Co-Chair in its heading, and the AE's must not, so the run never
 * presses Submit on another role's form.
 */
export function recommendSubmit(doc: Document, role: 'ae' | 'cc'): HTMLElement | null {
  const whose = recommendsRole(doc);
  if (!whose || (whose === 'cc') !== (role === 'cc')) return null;
  const subs = submitControls(doc).filter((e) => isShown(e));
  return subs.length === 1 ? subs[0]! : null;
}

/** Every Submit control on the page, shown or not (a text link, a button, or an image button). */
function submitControls(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('a, button, input[type=submit], input[type=button], input[type=image]')).filter((e) => {
    if (e.closest('[data-electric-mc]')) return false;
    const img = e.querySelector('img');
    const label = textOf(e) || e.getAttribute('value') || e.getAttribute('alt') || img?.getAttribute('alt') || img?.getAttribute('title') || '';
    return labelKey(label) === 'submit' || (!textOf(e) && /(^|[_/-])submit[^/]*\.(gif|png|svg)$/i.test(img?.getAttribute('src') ?? ''));
  });
}

/** What the run saw on a page where it couldn't find the form: counts only, for the banner and the log. */
export function formCounts(doc: Document, role: 'ae' | 'cc'): string {
  const radios = rejectRadios(doc);
  const subs = submitControls(doc);
  const shown = (xs: Element[]) => xs.filter((x) => isShown(x)).length;
  return `form ${recommendsRole(doc) ?? 'none'} (wanted ${role === 'cc' ? 'cc' : 'other'}), Reject choices ${shown(radios)} shown of ${radios.length}, Submit ${shown(subs)} shown of ${subs.length}`;
}

/** Whether MC sent the role's Recommends form back, with Reject, after a Submit: it didn't take it. */
export function formCameBack(doc: Document, page: Page, id: string, role: 'ae' | 'cc'): boolean {
  return (!page.manuscript || page.manuscript === id) && !!recommendSubmit(doc, role) && !!rejectRadio(doc);
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
    // On the co-chair's page MC may name the task plainly; the form it opens
    // is checked to be the co-chair's before anything is pressed.
    if (role === 'cc' && name === 'make recommendation') return link;
    if (role === 'ae' && name === 'make recommendation') return link;
  }
  return null;
}

/**
 * MC's "reviewers needed" field, when the page has one: a pull-down or text
 * box in a row that talks about the number of reviewers.
 */
export function reviewersField(doc: Document): HTMLSelectElement | HTMLInputElement | null {
  for (const f of Array.from(doc.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input[type=text], input[type=number], input[type=tel], input:not([type])'))) {
    if (f.closest('[data-electric-mc]')) continue;
    const row = f.closest('tr') ?? f.parentElement;
    const ctx = labelKey(`${row ? textOf(row) : ''} ${f.name} ${f.id}`);
    if (/(number of reviewers|reviewers? (required|needed)|reviews? required|required reviewers|minimum reviewers|num_?rev)/.test(ctx)) return f;
  }
  return null;
}

/**
 * The Save control for the reviewers-needed field: the nearest one in the
 * tables around it (MC puts it beside the Reviewer List).
 */
export function reviewersSave(doc: Document): HTMLElement | null {
  const f = reviewersField(doc);
  for (let at: Element | null = f?.parentElement ?? null; at && at !== doc.body; at = at.parentElement) {
    const hit = Array.from(at.querySelectorAll<HTMLElement>('a, button, input[type=button], input[type=submit], input[type=image], img')).find((e) => {
      if (e.closest('[data-electric-mc]')) return false;
      const file = (e.getAttribute('src') ?? '').split('/').pop() ?? '';
      return labelKey(textOf(e) || e.getAttribute('value') || e.getAttribute('alt') || e.getAttribute('title') || '') === 'save' || /^save\b|_save\b|\bsave\./i.test(file);
    });
    // An image button counts through the link around it, or its own onclick.
    if (hit) return hit.tagName === 'IMG' ? (hit.closest<HTMLElement>('a, button') ?? hit) : hit;
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
  'info-tab': 'going back to Manuscript Information',
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
      const shown = page.isDetails && !wrongPaper && !!aeName && foldName(aeName).replace(/\s/g, '').includes(foldName(s.ae).replace(/\s/g, ''));
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
      const submit = recommendSubmit(doc, role);
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
      if ((s.tries ?? 0) >= 3) return stopRun(doc, s, `couldn't find the Recommends form with a Reject choice (${formCounts(doc, role)}).`, hooks);
      // The form is on the page but not readable: pressing the task again won't help.
      if (recommendsRole(doc) && (s.tries ?? 0) >= 1) return stopRun(doc, s, `couldn't find the Recommends form with a Reject choice (${formCounts(doc, role)}).`, hooks);
      const task = recommendTask(doc, role);
      if (!task) {
        // MC shows the AE's Make Recommendation task only once the reviews
        // required to make a decision are 0: set it, press its Save, and look
        // again when the page comes back.
        let why = '';
        if (role === 'ae' && s.reviewers !== 'saved') {
          const save = reviewersField(doc) ? reviewersSave(doc) : null;
          if (save && setReviewersToZero(doc)) {
            writeRun(doc, { ...s, reviewers: 'saved', tries: (s.tries ?? 0) + 1 });
            hooks.log('one-button reject reviewers', { reviewers: 'saved' });
            pageClick(save);
            return;
          }
          why = !reviewersField(doc) ? ' (and no "reviews required" box to set to 0)' : !save ? ' (no Save next to the "reviews required" box)' : ' (the "reviews required" box would not take 0)';
          hooks.log('one-button reject reviewers', { reviewers: why.trim() });
        }
        // The co-chair's task can lag the AE's Submit, and a slow connection
        // can leave the page short: open the paper again, twice at most.
        if (role === 'cc' && (s.tries ?? 0) < 2) {
          writeRun(doc, { ...s, tries: (s.tries ?? 0) + 1 });
          hooks.log('one-button reject retry', { step: s.step, why: 'no co-chair recommendation task yet' });
          if (hooks.openBySearch(s.id)) return;
        }
        return stopRun(doc, s, `no ${role === 'ae' ? 'Make Recommendation' : 'co-chair recommendation'} task on the paper${role === 'ae' && s.reviewers === 'saved' ? ', even with the reviews required set to 0' : why}.`, hooks);
      }
      writeRun(doc, { ...s, tries: (s.tries ?? 0) + 1 });
      pageClick(task);
      return;
    }
    case 'ae-form':
      // Waiting for the person's Submit (see noteAeSubmit).
      return;
    case 'ae-sent': {
      // The step moves on only once MC has taken the Submit: if it sent the
      // form back (a required field, an error), wait for the next Submit.
      if (formCameBack(doc, page, s.id, 'ae')) {
        const n: RunState = { ...s, step: 'ae-form', tries: 0 };
        writeRun(doc, n);
        hooks.log('one-button reject step', { step: 'ae-form', why: 'MC sent the AE form back' });
        showBanner(doc, `One-button reject mode (${s.id}): MC didn't take that Submit. Fix what it says, then press Submit again.`, 'run', cancel);
        return;
      }
      const link = centerLink(doc, 'cc');
      if (!link) return stopRun(doc, s, 'no link to the Co-Chair Center.', hooks);
      next('cc-center');
      pageClick(link);
      return;
    }
    case 'cc-sent': {
      if (formCameBack(doc, page, s.id, 'cc')) {
        return stopRun(doc, s, "MC sent the co-chair form back instead of taking the Submit. Check what it says and press Submit yourself; the AE's Reject is already in.", hooks);
      }
      // MC leaves the paper open on its next task (Make Immediate Decision);
      // go back to the Manuscript Information tab, and say done there.
      const info = page.isDetails && !wrongPaper ? infoTabLink(doc) : null;
      if (info) {
        next('info-tab');
        pageClick(info);
        return;
      }
      return finish(doc, s, hooks);
    }
    case 'info-tab':
      return finish(doc, s, hooks);
  }
}

function finish(doc: Document, s: RunState, hooks: Hooks): void {
  writeRun(doc, null);
  hooks.log('one-button reject done', {});
  showBanner(doc, `One-button reject done (${s.id}): rejected as AE and as co-chair.`, 'done');
}

/**
 * The Manuscript Information tab on a details page, when another tab (a
 * task, the Audit Trail) is showing: MC's left tab image
 * lefttabs_mss_info_off.gif, in a link that shows the 'Tdetails' tab.
 */
export function infoTabLink(doc: Document): HTMLElement | null {
  const img = doc.querySelector<HTMLImageElement>('a img[src*="lefttabs_mss_info_off"]');
  if (img) return img.closest('a');
  return Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="MANUSCRIPT_DETAILS_SHOW_TAB"]')).find((a) => /'Tdetails'/.test(a.getAttribute('href') ?? '')) ?? null;
}

/**
 * The person's Submit on the AE form, after the page's guards let it
 * through. Keeps the comments for the co-chair step; a choice other than
 * Reject ends the run. The run goes on to the co-chair step on the next page
 * only if MC took the Submit (see 'ae-sent' in stepRun).
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
  const clear = () => cancelAdvance(doc);
  clear();
  setTimeout(clear, 0);
}
