// @vitest-environment jsdom
// Stop a recommendation or decision that has no choice picked. Synthetic
// markup shaped like MC's Recommends and Decision forms.
import { afterEach, describe, expect, it } from 'vitest';
import { missingChoice, NEED_CHOICE_ID, watchMissingChoice } from '../lib/needchoice';
import { watchAuthorComments } from '../lib/authorcomment';

const FORM = `<div id="sec"><table id="choices">
  <tr><th>Co-Chair Recommends</th></tr>
  <tr><td><input type="radio" name="r" id="acc"></td><td>Accept</td></tr>
  <tr><td><input type="radio" name="r" id="min"></td><td>Minor Revision</td></tr>
  <tr><td><input type="radio" name="r" id="rej"></td><td>Reject</td></tr>
</table>
<table><tr><td>Comments to the Author</td></tr><tr><td><textarea id="author"></textarea></td></tr></table></div>
<a href="#" id="draft">Save as Draft</a> <a href="#" id="submit"><img src="submit.gif" alt="">Submit</a>`;

const pick = (id: string) => {
  const r = document.getElementById(id) as HTMLInputElement;
  r.checked = true;
  r.dispatchEvent(new Event('change', { bubbles: true }));
};
const press = (id: string) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  document.getElementById(id)!.dispatchEvent(e);
  return e;
};

let stops: Array<() => void> = [];
afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
});

describe('missingChoice', () => {
  it('flags Submit in a Recommends table with no choice picked', () => {
    document.body.innerHTML = FORM;
    expect(missingChoice(document.getElementById('submit'))).toBe(true);
    pick('min');
    expect(missingChoice(document.getElementById('submit'))).toBe(false);
  });

  it('leaves other buttons and pages without choices alone', () => {
    document.body.innerHTML = FORM;
    expect(missingChoice(document.getElementById('draft'))).toBe(false);
    document.getElementById('choices')!.remove();
    document.body.insertAdjacentHTML('afterbegin', '<b>AE Recommends</b>');
    expect(missingChoice(document.getElementById('submit'))).toBe(false);
  });

  it('covers Commit Decision in a decision box', () => {
    document.body.innerHTML = `<table><tr><td><b>Co-Chair Immediate Decision</b></td></tr>
      <tr><td><input type="radio" name="d" id="ir"> Immediate Reject</td></tr></table>
      <a href="#" id="commit">Commit Decision</a>`;
    expect(missingChoice(document.getElementById('commit'))).toBe(true);
    pick('ir');
    expect(missingChoice(document.getElementById('commit'))).toBe(false);
  });

  it('ignores a Submit on a page with no Recommends or Decision heading', () => {
    document.body.innerHTML = `<input type="radio" name="x"><a href="#" id="submit">Submit</a>`;
    expect(missingChoice(document.getElementById('submit'))).toBe(false);
  });
});

describe('watchMissingChoice', () => {
  it('stops the press, shows the message above the choices and logs it', () => {
    document.body.innerHTML = FORM;
    const logged: unknown[] = [];
    let mcSaw = 0;
    document.getElementById('submit')!.addEventListener('click', () => mcSaw++);
    stops.push(watchMissingChoice(document, () => true, (d) => logged.push(d)));
    const e = press('submit');
    expect(e.defaultPrevented).toBe(true);
    expect(mcSaw).toBe(0);
    const note = document.getElementById(NEED_CHOICE_ID)!;
    expect(note.textContent).toMatch(/pick one of the choices/);
    expect(note.hasAttribute('data-electric-mc')).toBe(true);
    expect(note.nextElementSibling?.id).toBe('choices');
    expect(logged).toEqual([{ choices: 3 }]);
    // A second press doesn't add a second message.
    press('submit');
    expect(document.querySelectorAll(`#${NEED_CHOICE_ID}`).length).toBe(1);
  });

  it('lets the press through once a choice is picked, and removes the message', () => {
    document.body.innerHTML = FORM;
    stops.push(watchMissingChoice(document, () => true));
    press('submit');
    pick('acc');
    expect(document.getElementById(NEED_CHOICE_ID)).toBeNull();
    let mcSaw = 0;
    document.getElementById('submit')!.addEventListener('click', () => mcSaw++);
    expect(press('submit').defaultPrevented).toBe(false);
    expect(mcSaw).toBe(1);
  });

  it('does nothing when turned off', () => {
    document.body.innerHTML = FORM;
    stops.push(watchMissingChoice(document, () => false));
    expect(press('submit').defaultPrevented).toBe(false);
    expect(document.getElementById(NEED_CHOICE_ID)).toBeNull();
  });

  it('runs before the no-comment warning, which never asks about a stopped press', () => {
    document.body.innerHTML = FORM;
    let asked = 0;
    stops.push(watchMissingChoice(document, () => true));
    stops.push(watchAuthorComments(document, () => true, () => (asked++, true)));
    press('submit');
    expect(asked).toBe(0);
  });
});
