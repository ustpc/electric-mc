import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { annotateLogin, findLoginFields, tuckAccountLinks, watchForAutofill } from '../lib/login';

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

describe('tuckAccountLinks', () => {
  const PAGE = `<nav><a href="#">Log In</a> <a href="#">Reset Password</a> <a href="#" id="nav-create">Create An Account</a></nav>
    <div><label>User ID</label> <a href="#" id="side-create">Create an Account</a><input type="text"><input type="password"><button>Log In</button></div>`;

  it('replaces both links with one brown "more..." button', () => {
    document.body.innerHTML = PAGE;
    expect(tuckAccountLinks(document)).toBe(2);
    expect(document.getElementById('nav-create')!.style.display).toBe('none');
    expect(document.getElementById('side-create')!.style.display).toBe('none');
    const more = document.querySelectorAll<HTMLButtonElement>('[data-electric-mc="more-links"]');
    expect(more).toHaveLength(1);
    expect(more[0]!.textContent).toBe('more...');
    expect(more[0]!.style.color).toMatch(/rgb\(180, 83, 9\)|#b45309/i);
    expect(more[0]!.previousElementSibling!.id).toBe('nav-create');
    // Reset Password and Log In are left alone.
    expect(Array.from(document.querySelectorAll('a')).filter((a) => a.style.display === 'none')).toHaveLength(2);
  });

  it('brings them back when clicked, and stays out of the way after', () => {
    document.body.innerHTML = PAGE;
    tuckAccountLinks(document);
    document.querySelector<HTMLButtonElement>('[data-electric-mc="more-links"]')!.click();
    expect(document.getElementById('nav-create')!.style.display).toBe('');
    expect(document.getElementById('side-create')!.style.display).toBe('');
    expect(tuckAccountLinks(document)).toBe(0);
  });

  it('tucks a link drawn later behind the same button', () => {
    document.body.innerHTML = PAGE;
    tuckAccountLinks(document);
    document.body.insertAdjacentHTML('beforeend', '<a href="#" id="late">Create an account</a>');
    expect(tuckAccountLinks(document)).toBe(1);
    expect(document.querySelectorAll('[data-electric-mc="more-links"]')).toHaveLength(1);
  });
});
