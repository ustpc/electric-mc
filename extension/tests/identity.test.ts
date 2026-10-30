// Who is logged in, read from MC's analytics metadata. Synthetic person.
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { authorLabel, identityFromScript, mcName, readIdentity } from '../lib/identity';

const SCRIPT = `PENDO_SERVICE.initializePendoMetadata({visitor:
{id:"pat@example.org",
browser_language:"English",
email:"Pat@Example.org",
first_name:"Example",
last_name:"Co\\-Chair",
person_id:12345,
role_type_name:"EDITOR"
},
account: {
id:"Journal of Examples",
short_name:"xyzj"
},
location: {setUrl:"https://mc.manuscriptcentral.com/xyzj?page=X"}
});`;

describe('identityFromScript', () => {
  it('reads the logged-in person and journal', () => {
    expect(identityFromScript(SCRIPT)).toEqual({ email: 'pat@example.org', firstName: 'Example', lastName: 'Co-Chair', personId: '12345', role: 'EDITOR', journal: 'xyzj' });
  });
  it('returns null without the metadata or an email', () => {
    expect(identityFromScript('var x = 1;')).toBeNull();
    expect(identityFromScript('initializePendoMetadata({visitor:{id:"", email:""}})')).toBeNull();
  });
});

describe('readIdentity', () => {
  it('finds the inline script and ignores others', () => {
    const doc = new JSDOM(`<head><script src="/x.js"></script><script>var a=1</script><script>${SCRIPT}</script></head>`).window.document;
    expect(readIdentity(doc)?.email).toBe('pat@example.org');
  });
  it('returns null on a page without it', () => {
    expect(readIdentity(new JSDOM('<p>hi</p>').window.document)).toBeNull();
  });
});

describe('names', () => {
  const id = identityFromScript(SCRIPT)!;
  it("joins MC's first and last names", () => {
    expect(mcName(id)).toBe('Example Co-Chair');
    expect(mcName({ email: 'x@example.org' })).toBe('x@example.org');
  });
  it("shows MC's name in parentheses only when it differs", () => {
    expect(authorLabel('Pat Example', 'Example Co-Chair')).toBe('Pat Example (Example Co-Chair)');
    expect(authorLabel('example  co-chair', 'Example Co-Chair')).toBe('example  co-chair');
    expect(authorLabel('', 'Example Co-Chair')).toBe('Example Co-Chair');
  });
});
