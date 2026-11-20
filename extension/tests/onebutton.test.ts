// @vitest-environment jsdom
// One-button reject: the controls next to Assign and a whole run through
// synthetic pages. Synthetic markup and names only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addControls, findAssignButton, isPdfLink, noteAeSubmit, ownOption, readRun, recommendSubmit, rejectRadio, startRun, stepRun, writeRun } from '../lib/onebutton';
import { findAeSelect } from '../lib/aeload';

const WHO = { email: 'cochair@example.org', firstName: 'Opinions', lastName: 'Co-Chair' };

const ASSIGN_PAGE = `<table><tr><td>Associate Editor List</td></tr>
  <tr><td>Pick from a list:</td><td><select name="XIK_WORKFLOW_ASSIGN_TO_1">
    <option value="">Select an AE (# Current Assignments)</option>
    <option value="a">Editor, Pat (3)</option><option value="b">Co-Chair, Opinions (0)</option><option value="c">Editor, Robin (5)</option>
  </select> <a href="#">View Details</a> <a href="#" id="assign"><img src="/images/assign.gif" alt="Assign"></a></td></tr></table>`;

const DETAILS = (ae: string, links: string) => `<div><p>AE: ${ae}<br>CC: <a href="#">Co-Chair, Opinions</a><br>EIC: <a href="#">Chief, Robin</a></p>${links}</div>`;

const FORM = (heading: string) => `<table><tr><td><b>${heading}</b></td></tr>
  <tr><td><input type="radio" name="r" id="acc"></td><td>Accept</td></tr>
  <tr><td><input type="radio" name="r" id="rr"></td><td>Reject &amp; Resubmit</td></tr>
  <tr><td><input type="radio" name="r" id="rej"></td><td>Reject</td></tr>
  <tr><td><textarea name="T1_REVIEWER_COMMENTS_TO_EDITOR"></textarea><textarea name="T1_REVIEWER_COMMENTS_TO_AUTHOR"></textarea></td></tr>
  <tr><td><a href="#" id="submit">Submit</a></td></tr></table>`;

const hooks = () => ({ openBySearch: vi.fn(() => true), log: vi.fn() });
const clicks = (ids: string[]) => document.querySelectorAll('a[id]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); ids.push(a.id); }));

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe('controls next to Assign', () => {
  it('finds the Assign button and the logged-in person\'s entry', () => {
    document.body.innerHTML = ASSIGN_PAGE;
    const sel = findAeSelect(document)!.select;
    expect(findAssignButton(sel)?.id).toBe('assign');
    expect(ownOption(sel, WHO)?.value).toBe('b');
    expect(ownOption(sel, { ...WHO, lastName: 'Nobody' })).toBeNull();
  });

  it('finds an Assign link a table level up, and never an Assign Reviewers one', () => {
    const opts = '<option>Select...</option><option>Doe, Jane (2)</option><option>Roe, Rick (0)</option><option>Poe, Pat (1)</option>';
    document.body.innerHTML = `<form><table><tr><td>Assign Associate Editor</td></tr>
      <tr><td><table><tr><td>Associate Editor:</td><td><select name="XIK_WORKFLOW_ASSIGN_TO_1">${opts}</select></td></tr></table></td>
      <td><a href="#" id="far">Assign</a></td></tr></table></form>`;
    expect(findAssignButton(findAeSelect(document)!.select)?.id).toBe('far');
    document.body.innerHTML = `<form><table><tr><td>Assign Associate Editor</td></tr>
      <tr><td><select name="XIK_WORKFLOW_ASSIGN_TO_1">${opts}</select></td><td><a href="#">Assign Reviewers</a></td></tr></table></form>`;
    expect(findAssignButton(findAeSelect(document)!.select)).toBeNull();
  });

  it('finds an Assign image with its own onclick (no link around it)', () => {
    const opts = '<option>Select...</option><option>Doe, Jane (2)</option><option>Roe, Rick (0)</option><option>Poe, Pat (1)</option>';
    document.body.innerHTML = `<table><tr><td>Associate Editor:</td><td><select name="XIK_WORKFLOW_ASSIGN_TO_42">${opts}</select>
      <img id="img" src="/images/en_US/buttons/assign.gif" onclick="return false"></td></tr></table>`;
    expect(findAssignButton(findAeSelect(document)!.select)?.id).toBe('img');
    expect(addControls(document, false, () => {})).toBe(true);
    expect(document.getElementById('img')!.nextElementSibling?.getAttribute('data-electric-mc')).toBe('one-button');
  });

  it('stays disabled until the PDF was opened and the box is checked', () => {
    document.body.innerHTML = ASSIGN_PAGE;
    const start = vi.fn();
    expect(addControls(document, false, start)).toBe(true);
    const go = document.querySelector<HTMLButtonElement>('[data-ob="go"]')!;
    const box = document.querySelector<HTMLInputElement>('[data-ob="arm"]')!;
    expect(document.querySelector('[data-electric-mc="one-button"]')!.previousElementSibling?.id).toBe('assign');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(go.disabled).toBe(true);
    addControls(document, true, start);
    expect(go.disabled).toBe(false);
    go.click();
    expect(start).toHaveBeenCalledOnce();
  });

  it('knows a PDF link', () => {
    document.body.innerHTML = '<a id="p" href="#">PDF</a><a id="h" href="#">HTML</a>';
    expect(isPdfLink(document.getElementById('p'))).toBe(true);
    expect(isPdfLink(document.getElementById('h'))).toBe(false);
  });

  it('picks Reject, not Reject & Resubmit', () => {
    document.body.innerHTML = FORM('Associate Editor Recommends');
    expect(rejectRadio(document)?.id).toBe('rej');
  });
});

describe('a whole run', () => {
  it('assigns, recommends as AE, then as co-chair, and submits', () => {
    vi.useFakeTimers();
    const h = hooks();
    const ids: string[] = [];
    const ID = 'XYZJ-26-09-9011';

    document.body.innerHTML = ASSIGN_PAGE;
    clicks(ids);
    expect(startRun(document, ID, WHO)).toBeNull();
    expect(findAeSelect(document)!.select.value).toBe('b');
    expect(ids).toEqual(['assign']);
    expect(readRun(document)?.step).toBe('assigned');

    // Back on the paper with the AE shown: on to the AE center.
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', '<a href="#" id="aec">Associate Editor Center</a>');
    clicks(ids);
    stepRun(document, { manuscript: ID, isDetails: true }, 'Co-Chair, Opinions', h);
    expect(ids.at(-1)).toBe('aec');
    expect(readRun(document)?.step).toBe('ae-center');

    // The AE dashboard: search for the paper.
    document.body.innerHTML = '<p>Associate Editor Dashboard</p>';
    stepRun(document, { isDetails: false }, undefined, h);
    expect(h.openBySearch).toHaveBeenCalledWith(ID);
    expect(readRun(document)?.step).toBe('ae-details');

    // The paper as AE: open Make Recommendation.
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', '<a href="#" id="task">Make Recommendation (Due 01-Dec-2026)</a>');
    clicks(ids);
    stepRun(document, { manuscript: ID, isDetails: true }, 'Co-Chair, Opinions', h);
    expect(ids.at(-1)).toBe('task');

    // The form: Reject picked, cursor in the comments.
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', FORM('Associate Editor Recommends'));
    stepRun(document, { manuscript: ID, isDetails: true }, 'Co-Chair, Opinions', h);
    expect((document.getElementById('rej') as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement?.getAttribute('name')).toBe('T1_REVIEWER_COMMENTS_TO_AUTHOR');
    expect(document.querySelector('[data-electric-mc="one-button-banner"]')!.textContent).toContain('One-button reject mode');

    // The person writes and submits.
    (document.querySelector('[name$=TO_AUTHOR]') as HTMLTextAreaElement).value = 'Synthetic comment to the author.';
    (document.querySelector('[name$=TO_EDITOR]') as HTMLTextAreaElement).value = 'Synthetic note.';
    sessionStorage.setItem('emc-advance', '{}');
    noteAeSubmit(document, h);
    expect(readRun(document)).toMatchObject({ step: 'ae-sent', toAuthor: 'Synthetic comment to the author.', toEditor: 'Synthetic note.' });
    expect(sessionStorage.getItem('emc-advance')).toBeNull();

    // Back to the Co-Chair Center, search, open the co-chair task.
    document.body.innerHTML = '<a href="#" id="ccc">Co-Chair Center</a>';
    clicks(ids);
    stepRun(document, { manuscript: ID, isDetails: true }, 'Co-Chair, Opinions', h);
    expect(ids.at(-1)).toBe('ccc');
    document.body.innerHTML = '<p>Co-Chair Dashboard</p>';
    stepRun(document, { isDetails: false }, undefined, h);
    expect(readRun(document)?.step).toBe('cc-details');
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', '<a href="#" id="cctask">Co-Chair Make Recommendation</a>');
    clicks(ids);
    stepRun(document, { manuscript: ID, isDetails: true }, 'Co-Chair, Opinions', h);
    expect(ids.at(-1)).toBe('cctask');

    // The co-chair form: filled in and submitted.
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', FORM('Co-Chair Recommends'));
    clicks(ids);
    stepRun(document, { manuscript: ID, isDetails: true }, 'Co-Chair, Opinions', h);
    expect((document.getElementById('rej') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('[name$=TO_AUTHOR]') as HTMLTextAreaElement).value).toBe('Synthetic comment to the author.');
    expect((document.querySelector('[name$=TO_EDITOR]') as HTMLTextAreaElement).value).toBe('Synthetic note.');
    expect(ids.at(-1)).not.toBe('submit');
    vi.advanceTimersByTime(700);
    expect(ids.at(-1)).toBe('submit');
    expect(readRun(document)?.step).toBe('cc-sent');

    document.body.innerHTML = '<p>done</p>';
    stepRun(document, { manuscript: ID, isDetails: true }, undefined, h);
    expect(readRun(document)).toBeNull();
  });

  it('stops when MC opens another paper', () => {
    const h = hooks();
    writeRun(document, { id: 'XYZJ-26-09-9011', step: 'ae-details', at: Date.now(), ae: 'Co-Chair, Opinions' });
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', '');
    stepRun(document, { manuscript: 'XYZJ-26-09-9012', isDetails: true }, 'Co-Chair, Opinions', h);
    expect(readRun(document)).toBeNull();
    expect(document.querySelector('[data-electric-mc="one-button-banner"]')!.textContent).toContain('stopped');
  });

  it('with no Make Recommendation task, sets the reviews required to 0 and presses Save, then opens the task', () => {
    const h = hooks();
    const ids: string[] = [];
    writeRun(document, { id: 'XYZJ-26-09-9011', step: 'ae-details', at: Date.now(), ae: 'Co-Chair, Opinions' });
    const reviewers = (n: string, task = '') => DETAILS('Co-Chair, Opinions', `${task}<table><tr><td><table><tr><td>Reviewer List</td></tr><tr><td><a href="#" id="save">Save</a></td></tr></table></td>
      <td><table><tr><td>Progress</td></tr><tr><td># reviews required to make decision</td><td><input type="text" id="req" value="${n}"></td></tr></table></td></tr></table>`);
    document.body.innerHTML = reviewers('2');
    clicks(ids);
    stepRun(document, { manuscript: 'XYZJ-26-09-9011', isDetails: true }, 'Co-Chair, Opinions', h);
    expect((document.getElementById('req') as HTMLInputElement).value).toBe('0');
    expect(ids).toEqual(['save']);
    expect(readRun(document)?.reviewers).toBe('saved');
    // MC comes back with the task.
    document.body.innerHTML = reviewers('0', '<a href="#" id="task">Make Recommendation</a>');
    clicks(ids);
    stepRun(document, { manuscript: 'XYZJ-26-09-9011', isDetails: true }, 'Co-Chair, Opinions', h);
    expect(ids).toEqual(['save', 'task']);
    // Still no task after Save: stop, saying so.
    writeRun(document, { id: 'XYZJ-26-09-9011', step: 'ae-details', at: Date.now(), ae: 'Co-Chair, Opinions', reviewers: 'saved' });
    document.body.innerHTML = reviewers('0');
    stepRun(document, { manuscript: 'XYZJ-26-09-9011', isDetails: true }, 'Co-Chair, Opinions', h);
    expect(readRun(document)).toBeNull();
    expect(document.querySelector('[data-electric-mc="one-button-banner"]')!.textContent).toContain('reviews required set to 0');
  });

  it('stops when the AE step was not Reject', () => {
    const h = hooks();
    writeRun(document, { id: 'XYZJ-26-09-9011', step: 'ae-form', at: Date.now(), ae: 'Co-Chair, Opinions' });
    document.body.innerHTML = FORM('Associate Editor Recommends');
    (document.getElementById('acc') as HTMLInputElement).checked = true;
    noteAeSubmit(document, h);
    expect(readRun(document)).toBeNull();
  });

  it('presses Submit only on its own role\'s form', () => {
    document.body.innerHTML = FORM('Associate Editor Recommends');
    expect(recommendSubmit(document, 'ae')?.id).toBe('submit');
    expect(recommendSubmit(document, 'cc')).toBeNull();
    document.body.innerHTML = FORM('Co-Chair Recommends');
    expect(recommendSubmit(document, 'cc')?.id).toBe('submit');
    expect(recommendSubmit(document, 'ae')).toBeNull();
    document.body.innerHTML = FORM('Reviewer Recommends');
    expect(recommendSubmit(document, 'cc')).toBeNull();
  });

  it('stops at the co-chair step if the form there is another role\'s', () => {
    const h = hooks();
    const ids: string[] = [];
    writeRun(document, { id: 'XYZJ-26-09-9011', step: 'cc-details', at: Date.now(), ae: 'Co-Chair, Opinions', tries: 2 });
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', FORM('Associate Editor Recommends'));
    clicks(ids);
    stepRun(document, { manuscript: 'XYZJ-26-09-9011', isDetails: true }, 'Co-Chair, Opinions', h);
    expect(ids).not.toContain('submit');
    expect(readRun(document)).toBeNull();
  });

  it('waits for another Submit when MC sends the AE form back', () => {
    const h = hooks();
    const ids: string[] = [];
    writeRun(document, { id: 'XYZJ-26-09-9011', step: 'ae-sent', at: Date.now(), ae: 'Co-Chair, Opinions', toAuthor: 'x' });
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', FORM('Associate Editor Recommends') + '<a href="#" id="ccc">Co-Chair Center</a>');
    clicks(ids);
    stepRun(document, { manuscript: 'XYZJ-26-09-9011', isDetails: true }, 'Co-Chair, Opinions', h);
    expect(ids).not.toContain('ccc');
    expect(readRun(document)?.step).toBe('ae-form');
    expect(document.querySelector('[data-electric-mc="one-button-banner"]')!.textContent).toContain("didn't take that Submit");
  });

  it('stops instead of saying done when MC sends the co-chair form back', () => {
    const h = hooks();
    writeRun(document, { id: 'XYZJ-26-09-9011', step: 'cc-sent', at: Date.now(), ae: 'Co-Chair, Opinions' });
    document.body.innerHTML = DETAILS('Co-Chair, Opinions', FORM('Co-Chair Recommends'));
    stepRun(document, { manuscript: 'XYZJ-26-09-9011', isDetails: true }, 'Co-Chair, Opinions', h);
    expect(readRun(document)).toBeNull();
    expect(document.querySelector('[data-electric-mc="one-button-banner"]')!.textContent).toContain('stopped');
    expect(h.log).toHaveBeenCalledWith('one-button reject stopped', expect.anything());
  });
});
