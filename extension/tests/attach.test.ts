// @vitest-environment jsdom
// Auto-Attach after a file is chosen, on synthetic upload forms.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTACH_DELAY_MS, findAttachControl, watchFileAttach } from '../lib/attach';

function chooseFile(input: HTMLInputElement) {
  const file = new File(['synthetic'], 'synthetic-paper.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function countClicks(el: Element): () => number {
  let n = 0;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    n++;
  });
  return () => n;
}

describe('watchFileAttach', () => {
  let stop = () => {};
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('clicks the Attach link in the file input row after a short wait', () => {
    document.body.innerHTML = `<form><table>
      <tr><td><input type="file" id="f1"></td><td><a href="javascript:attach(1)">Attach</a></td></tr>
      <tr><td><input type="file" id="f2"></td><td><a href="javascript:attach(2)" id="a2">Attach</a></td></tr>
    </table></form>`;
    const [a1, a2] = Array.from(document.querySelectorAll('a'));
    const c1 = countClicks(a1!);
    const c2 = countClicks(a2!);
    const seen: boolean[] = [];
    stop = watchFileAttach(document, () => true, (f) => seen.push(f));
    chooseFile(document.getElementById('f2') as HTMLInputElement);
    expect(c2()).toBe(0);
    vi.advanceTimersByTime(ATTACH_DELAY_MS);
    expect([c1(), c2()]).toEqual([0, 1]);
    expect(seen).toEqual([true]);
  });

  it('clicks an image button whose alt is Attach', () => {
    document.body.innerHTML = '<form><input type="file" id="f"><input type="image" alt="Attach" src="data:,"></form>';
    const btn = document.querySelector('input[type=image]')!;
    const clicks = countClicks(btn);
    stop = watchFileAttach(document, () => true);
    chooseFile(document.getElementById('f') as HTMLInputElement);
    vi.advanceTimersByTime(ATTACH_DELAY_MS);
    expect(clicks()).toBe(1);
  });

  it('clicks nothing when there is no Attach control', () => {
    document.body.innerHTML = '<form><input type="file" id="f"><a href="#">Save</a> <button type="button">Cancel</button></form>';
    const a = countClicks(document.querySelector('a')!);
    const b = countClicks(document.querySelector('button')!);
    const seen: boolean[] = [];
    stop = watchFileAttach(document, () => true, (f) => seen.push(f));
    chooseFile(document.getElementById('f') as HTMLInputElement);
    vi.advanceTimersByTime(1000);
    expect([a(), b()]).toEqual([0, 0]);
    expect(seen).toEqual([false]);
  });

  it('clicks nothing when the setting is off', () => {
    document.body.innerHTML = '<form><input type="file" id="f"><a href="#">Attach</a></form>';
    const clicks = countClicks(document.querySelector('a')!);
    stop = watchFileAttach(document, () => false);
    chooseFile(document.getElementById('f') as HTMLInputElement);
    vi.advanceTimersByTime(1000);
    expect(clicks()).toBe(0);
  });

  it('skips a disabled control and ambiguous ones outside the row', () => {
    document.body.innerHTML = '<form><input type="file" id="f"><button disabled>Attach</button></form>';
    expect(findAttachControl(document.getElementById('f') as HTMLInputElement)).toBeNull();
    document.body.innerHTML = '<form><input type="file" id="f"><a href="#">Attach File</a><a href="#">Attach Figure</a></form>';
    expect(findAttachControl(document.getElementById('f') as HTMLInputElement)).toBeNull();
  });
});
