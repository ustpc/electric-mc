// @vitest-environment jsdom
// Warn before a decision or recommendation goes out with no comment to the
// author. Synthetic markup shaped like MC's Recommends and Decision forms.
import { afterEach, describe, expect, it } from 'vitest';
import { authorBoxes, missingAuthorComment, watchAuthorComments } from '../lib/authorcomment';

const FORM = `<table>
  <tr><th>AE Recommends</th></tr>
  <tr><td><input type="radio" name="r" id="acc"></td><td>Accept</td></tr>
  <tr><td><input type="radio" name="r" id="rej"></td><td><table><tr><td><p>Reject</p></td></tr></table></td></tr>
  <tr><td><input type="radio" name="r" id="fwd"></td><td>Forward to another editor</td></tr>
  <tr><td>Comments to the Author</td></tr>
  <tr><td><textarea id="author"></textarea></td></tr>
  <tr><td>Confidential Comments to the Editor</td></tr>
  <tr><td><textarea id="editor"></textarea></td></tr>
</table>
<a href="#" id="draft">Save as Draft</a> <a href="#" id="submit"><img src="submit.gif" alt="">Submit</a>`;

const pick = (id: string) => ((document.getElementById(id) as HTMLInputElement).checked = true);
const type = (id: string, v: string) => ((document.getElementById(id) as HTMLTextAreaElement).value = v);
const press = (id: string) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  document.getElementById(id)!.dispatchEvent(e);
  return e;
};

let stop = () => {};
afterEach(() => stop());

describe('missingAuthorComment', () => {
  it('finds the author box and not the editor box', () => {
    document.body.innerHTML = FORM;
    expect(authorBoxes(document).map((b) => b.id)).toEqual(['author']);
  });

  it('flags Submit on an accept or reject choice with no comment to the author', () => {
    document.body.innerHTML = FORM;
    pick('rej');
    type('editor', 'only for the editor');
    expect(missingAuthorComment(document.getElementById('submit'))).toEqual({ choice: 'Reject' });
    type('author', 'Thank you for your submission.');
    expect(missingAuthorComment(document.getElementById('submit'))).toBeNull();
  });

  it('leaves other choices, other buttons and pages with no author box alone', () => {
    document.body.innerHTML = FORM;
    pick('fwd');
    expect(missingAuthorComment(document.getElementById('submit'))).toBeNull();
    pick('acc');
    expect(missingAuthorComment(document.getElementById('draft'))).toBeNull();
    document.getElementById('author')!.remove();
    expect(missingAuthorComment(document.getElementById('submit'))).toBeNull();
  });

  it('covers Commit Decision in a decision box', () => {
    document.body.innerHTML = `<table><tr><td><b>Co-Chair Immediate Decision</b></td></tr>
      <tr><td><input type="radio" name="d" id="ir"> Immediate Reject</td></tr>
      <tr><td>Comments to Author</td></tr><tr><td><textarea name="comments"></textarea></td></tr></table>
      <a href="#" id="commit">Commit Decision</a>`;
    pick('ir');
    expect(missingAuthorComment(document.getElementById('commit'))).toEqual({ choice: 'Immediate Reject' });
  });
});

describe('watchAuthorComments', () => {
  it('stops the press when the person cancels, and lets it through when they confirm', () => {
    document.body.innerHTML = FORM;
    pick('acc');
    let answer = false;
    const asked: string[] = [];
    let reached = 0;
    stop = watchAuthorComments(document, () => true, (m) => (asked.push(m), answer));
    // Registered after ours, like auto-advance: it must not see a cancelled press.
    document.addEventListener('click', () => reached++, true);
    expect(press('submit').defaultPrevented).toBe(true);
    expect(reached).toBe(0);
    expect(asked[0]).toContain('"Accept"');
    answer = true;
    expect(press('submit').defaultPrevented).toBe(false);
    expect(reached).toBe(1);
  });

  it('does nothing when the extension is off for the site', () => {
    document.body.innerHTML = FORM;
    pick('acc');
    let asked = 0;
    stop = watchAuthorComments(document, () => false, () => (asked++, false));
    expect(press('submit').defaultPrevented).toBe(false);
    expect(asked).toBe(0);
  });
});
