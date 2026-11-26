import { describe, expect, it } from 'vitest';
import { scriptSnippets, scrubSnippet } from '../lib/scriptpeek';

describe('popup script peek', () => {
  it('keeps code around the opener and takes out tokens, addresses and long text', () => {
    const code = `var a = 1;\nwindow.opener.location.href = 'cacm?PARAMS=xik_ABC123def';\nalert('This is a long made-up message for the test');\nsetField('DOCUMENT_HASHCODE', '');`;
    const s = scriptSnippets(code);
    expect(s).toContain("opener.location.href = 'cacm?PARAMS=xik_…'");
    expect(s.some((x) => x.startsWith('DOCUMENT_HASHCODE'))).toBe(true);
    expect(s.join(' ')).not.toMatch(/ABC123/);
  });
  it('scrubs e-mail addresses and long quoted text', () => {
    expect(scrubSnippet("x = 'test@example.com'")).toBe("x = '<email>'");
    expect(scrubSnippet("y = 'This is a test of a long quoted text'")).toBe("y = '…'");
  });
});
