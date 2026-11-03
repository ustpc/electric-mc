// @vitest-environment jsdom
// Clicking anywhere in a radio-button row picks that row's radio button.
// Synthetic markup shaped like MC's Co-Chair Recommends table.
import { afterEach, describe, expect, it } from 'vitest';
import { watchRadioRows } from '../lib/radiorow';

const TABLE = `<table>
  <tr><th colspan="2">Recommends</th></tr>
  <tr><td><input type="radio" name="r" value="a" id="a"></td><td id="a-label">Accept</td></tr>
  <tr><td><input type="radio" name="r" value="b" id="b"></td><td id="b-label">Minor Revision <a href="#" id="help">?</a></td></tr>
  <tr><td><input type="radio" name="r" value="c" id="c" disabled></td><td id="c-label">Reject</td></tr>
  <tr><td><input type="radio" name="x" id="x1"> <input type="radio" name="x" id="x2"></td><td id="two">Two choices</td></tr>
</table>`;

let stop = () => {};
afterEach(() => stop());

const click = (id: string) => document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
const checked = (id: string) => (document.getElementById(id) as HTMLInputElement).checked;

describe('watchRadioRows', () => {
  it('picks the radio button when the label cell is clicked, and runs its handlers', () => {
    document.body.innerHTML = TABLE;
    let changes = 0;
    document.getElementById('a')!.addEventListener('change', () => changes++);
    stop = watchRadioRows(document, () => true);
    click('a-label');
    expect(checked('a')).toBe(true);
    expect(changes).toBe(1);
    click('b-label');
    expect([checked('a'), checked('b')]).toEqual([false, true]);
  });

  it('leaves links, disabled choices and rows with two radio buttons alone', () => {
    document.body.innerHTML = TABLE;
    stop = watchRadioRows(document, () => true);
    click('help');
    expect(checked('b')).toBe(false);
    click('c-label');
    expect(checked('c')).toBe(false);
    click('two');
    expect([checked('x1'), checked('x2')]).toEqual([false, false]);
  });

  it('does nothing when the extension is off for the site', () => {
    document.body.innerHTML = TABLE;
    stop = watchRadioRows(document, () => false);
    click('a-label');
    expect(checked('a')).toBe(false);
  });
});
