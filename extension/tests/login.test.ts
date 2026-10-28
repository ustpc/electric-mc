import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { annotateLogin, findLoginFields, pictureAccountLinks, watchForAutofill } from '../lib/login';

const html = readFileSync(join(__dirname, 'fixtures', 'login.html'), 'utf8');

function setup() {
  const dom = new JSDOM(html, { url: 'https://mc.manuscriptcentral.com/cacm' });
  const doc = dom.window.document;
  const f = findLoginFields(doc)!;
  return { dom, doc, f };
}

describe('login help', () => {
  it('finds the fields and the real Log In button', () => {
    const { f } = setup();
    expect(f.user.name).toBe('USERID');
    expect(f.password.name).toBe('PASSWORD');
    expect((f.submit as HTMLInputElement).value).toBe('Log In');
  });

  it('adds autocomplete hints', () => {
    const { f } = setup();
    annotateLogin(f);
    expect(f.user.getAttribute('autocomplete')).toBe('username');
    expect(f.password.getAttribute('autocomplete')).toBe('current-password');
  });

  it('submits once after a password manager fills both fields', async () => {
    vi.useFakeTimers();
    const { dom, f } = setup();
    const click = vi.fn();
    f.submit!.addEventListener('click', (e) => {
      e.preventDefault();
      click();
    });
    const done = vi.fn();
    watchForAutofill(f, done);
    f.user.value = 'someone';
    f.user.dispatchEvent(new dom.window.Event('input'));
    f.password.value = 'secret';
    f.password.dispatchEvent(new dom.window.Event('input'));
    vi.advanceTimersByTime(500);
    expect(click).toHaveBeenCalledTimes(1);
    // A second fill within a minute (say the password was wrong) doesn't loop.
    f.password.dispatchEvent(new dom.window.Event('input'));
    vi.advanceTimersByTime(500);
    expect(click).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not submit while the person is typing', () => {
    vi.useFakeTimers();
    const { dom, f } = setup();
    const click = vi.fn();
    f.submit!.addEventListener('click', (e) => {
      e.preventDefault();
      click();
    });
    watchForAutofill(f, () => {});
    f.user.value = 'someone';
    f.password.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's' }));
    f.password.value = 'secret';
    f.password.dispatchEvent(new dom.window.Event('input'));
    vi.advanceTimersByTime(500);
    expect(click).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('pictureAccountLinks', () => {
  const PAGE = `<nav><a href="#">Log In</a> <a href="#">Reset Password</a> <a href="#" id="nav-create">Create An Account</a></nav>
    <div><label>User ID</label> <a href="#" id="side-create">Create an Account</a><input type="text"><input type="password"><button>Log In</button></div>`;

  it('leaves no sign-up words on the page, and keeps both links where they were', () => {
    document.body.innerHTML = PAGE;
    expect(pictureAccountLinks(document)).toBe(2);
    expect(document.body.textContent).not.toMatch(/create|account/i);
    for (const id of ['nav-create', 'side-create']) {
      const a = document.getElementById(id)!;
      const img = a.querySelector('img')!;
      expect(img.getAttribute('data-electric-mc')).toBe('pictured-link');
      expect(img.alt).toBe('');
    }
    expect(document.querySelector('nav')!.textContent).toMatch(/Log In\s+Reset Password/);
  });

  it('keeps the links working, and is safe to run again', () => {
    document.body.innerHTML = PAGE;
    pictureAccountLinks(document);
    let clicks = 0;
    document.getElementById('side-create')!.addEventListener('click', (e) => { e.preventDefault(); clicks++; });
    document.querySelector<HTMLImageElement>('#side-create img')!.click();
    expect(clicks).toBe(1);
    expect(pictureAccountLinks(document)).toBe(0);
    expect(document.querySelectorAll('img[data-electric-mc="pictured-link"]')).toHaveLength(2);
  });
});
