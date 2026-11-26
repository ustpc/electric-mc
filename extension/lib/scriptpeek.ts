// Developer diagnostic (0.0.104, Create and Add): what MC's own inline
// scripts in a popup do with the window that opened it and with
// DOCUMENT_HASHCODE. Only short code snippets around "opener",
// "DOCUMENT_HASHCODE" or a location change, with MC's tokens, e-mail
// addresses and any long quoted text taken out, go to the local log. Never
// page text, names or field values.

const PATTERNS = [/opener[^;\n]{0,160}/g, /DOCUMENT_HASHCODE[^;\n]{0,120}/g, /location(?:\.href)?\s*=[^;\n]{0,160}/g, /\.submit\(\)[^;\n]{0,40}/g];

/** Scrub a code snippet: tokens, e-mail addresses and quoted text longer than 24 characters go. */
export function scrubSnippet(s: string): string {
  return s
    .replace(/xik_[A-Za-z0-9_]+/g, 'xik_…')
    .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/(['"])((?:(?!\1).){25,}?)\1/g, '$1…$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The scrubbed snippets in one script's text, at most `max`. */
export function scriptSnippets(code: string, max = 12): string[] {
  const out: string[] = [];
  for (const re of PATTERNS) {
    for (const m of code.matchAll(re)) {
      const s = scrubSnippet(m[0]);
      if (s && !out.includes(s)) out.push(s);
      if (out.length >= max) return out;
    }
  }
  return out;
}
