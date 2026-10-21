// @vitest-environment jsdom
// The background version lookup must never click a script link in the
// person's page: MC's scripts navigate the whole tab. Synthetic markup only.
import { describe, expect, it } from 'vitest';
import { loadInHiddenFrame, plainHref } from '../lib/versions';

describe('loadInHiddenFrame', () => {
  it('rejects a javascript: link without clicking it or touching the forms', async () => {
    document.body.innerHTML = '<form name="f"><input type="hidden" name="x" value="1"></form><a href="javascript:switchDetails(\'TEST-9001\')">Switch Details</a>';
    const a = document.querySelector('a')!;
    let clicks = 0;
    a.addEventListener('click', () => clicks++);
    await expect(loadInHiddenFrame(document, a)).rejects.toThrow(/script link/);
    expect(clicks).toBe(0);
    expect(document.forms[0]!.hasAttribute('target')).toBe(false);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('rejects an onclick-only element the same way', async () => {
    document.body.innerHTML = '<img onclick="return false" alt="Switch Details">';
    const img = document.querySelector('img')!;
    let clicks = 0;
    img.addEventListener('click', () => clicks++);
    await expect(loadInHiddenFrame(document, img)).rejects.toThrow(/script link/);
    expect(clicks).toBe(0);
  });

  it('takes only plain http(s) addresses', () => {
    document.body.innerHTML = '<a id="a" href="/cgi-bin/main?details=1">x</a><a id="b" href="#">x</a><a id="c" href="mailto:pat@example.org">x</a>';
    expect(plainHref(document, document.getElementById('a')!)).toMatch(/^http.*details=1$/);
    expect(plainHref(document, document.getElementById('b')!)).toBeNull();
    expect(plainHref(document, document.getElementById('c')!)).toBeNull();
  });
});
