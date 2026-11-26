import { beforeEach, describe, expect, it } from 'vitest';
import { DOC_HASH_MS, keepDocHash } from '../lib/dochash';

const page = (value: string) => {
  document.body.innerHTML = `<form><input type="hidden" name="DOCUMENT_HASHCODE" value="${value}"></form>`;
  return document.querySelector<HTMLInputElement>('input')!;
};

describe("MC's document code", () => {
  beforeEach(() => sessionStorage.clear());
  it('remembers the code and puts it back on the same manuscript', () => {
    page('1234567890');
    expect(keepDocHash(document, 'XYZJ-26-09-9011', 1000)).toBe('kept');
    const f = page('');
    expect(keepDocHash(document, 'XYZJ-26-09-9011', 2000)).toBe('restored');
    expect(f.value).toBe('1234567890');
  });
  it('never fills in another manuscript, an old code, or a page without the field', () => {
    page('1234567890');
    keepDocHash(document, 'XYZJ-26-09-9011', 1000);
    page('');
    expect(keepDocHash(document, 'XYZJ-26-09-9012', 2000)).toBeNull();
    expect(keepDocHash(document, 'XYZJ-26-09-9011', 1000 + DOC_HASH_MS + 1)).toBeNull();
    document.body.innerHTML = '';
    expect(keepDocHash(document, 'XYZJ-26-09-9011', 2000)).toBeNull();
  });
});
