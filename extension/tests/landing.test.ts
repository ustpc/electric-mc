import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { coChairLanding, markLoggedIn, watchLoginSubmit } from '../lib/landing';

const MENU = `<ul class="nav"><li class="dropdown"><a class="dropdown-toggle">Manage</a>
  <ul class="dropdown-menu">
    <li><a href="javascript:setNextPage('AUTHOR')">Author Center</a></li>
    <li><a href="javascript:setNextPage('AE')">Associate Editor Center</a></li>
    <li><a href="javascript:setNextPage('COCHAIR')">Co-Chair Center</a></li>
  </ul></li></ul>`;

function page(body: string) {
  const dom = new JSDOM(`<!doctype html><html><head><title>ScholarOne Manuscripts</title></head><body>${body}</body></html>`, { url: 'https://mc.manuscriptcentral.com/cacm' });
  return dom.window.document;
}

describe('landing after login', () => {
  it('picks the Co-Chair Center on the first page after a login, once', () => {
    const doc = page(`${MENU}<h1>Welcome</h1>`);
    markLoggedIn(doc.defaultView!, 1000);
    expect(coChairLanding(doc, 2000)?.textContent).toBe('Co-Chair Center');
    expect(coChairLanding(doc, 3000)).toBeNull();
  });

  it('does nothing without a login mark', () => {
    expect(coChairLanding(page(`${MENU}<h1>Welcome</h1>`))).toBeNull();
  });

  it('does nothing for someone without the AE Center', () => {
    const doc = page(`<a href="#">Author Center</a><a href="#">Co-Chair Center</a>`);
    markLoggedIn(doc.defaultView!, 1000);
    expect(coChairLanding(doc, 2000)).toBeNull();
  });

  it('does nothing when already in the Co-Chair Center', () => {
    const doc = page(`${MENU}<ol class="breadcrumb"><li>Co-Chair Dashboard</li></ol>`);
    markLoggedIn(doc.defaultView!, 1000);
    expect(coChairLanding(doc, 2000)).toBeNull();
  });

  it('keeps the mark through the verification-code step, and drops a stale one', () => {
    const code = page(`${MENU}<div>Unrecognized Device. Enter the Verification Code we emailed.<input></div>`);
    markLoggedIn(code.defaultView!, 1000);
    expect(coChairLanding(code, 2000)).toBeNull();
    // Same tab's sessionStorage: the code page didn't use the mark up.
    expect(code.defaultView!.sessionStorage.getItem('emc-logged-in-at')).toBe('1000');
    const doc = page(`${MENU}<h1>Welcome</h1>`);
    markLoggedIn(doc.defaultView!, 1000);
    expect(coChairLanding(doc, 1000 + 10 * 60_000)).toBeNull();
  });

  it('marks the tab when the login form is submitted', () => {
    const doc = page(`<form><input name="u"><input type="password" name="p"><button type="button">Log In</button></form>`);
    const pw = doc.querySelector<HTMLInputElement>('input[type=password]')!;
    const btn = doc.querySelector<HTMLElement>('button')!;
    const stop = watchLoginSubmit(pw, btn);
    btn.click();
    expect(Number(doc.defaultView!.sessionStorage.getItem('emc-logged-in-at'))).toBeGreaterThan(0);
    stop();
  });
});
