// Weekly page samples, for the local tests on real data (tests-real/). In a
// test build with developer mode on, the first time each week that a page
// with a given MC name (CURRENT_PAGE, lib/mcpage.ts) loads, its HTML goes
// to the live-log helper (tools/log-host), which saves it as
// var/real-pages/<CURRENT_PAGE>.html on this computer, replacing last
// week's. So the tests always have a recent copy of each kind of page and
// show when MC changes. Scripts and anything typed into fields are left out
// (the same snapshot as Capture page HTML). Nothing is sent anywhere else,
// and the Web Store build has no live-log helper, so it never does this.

export const SAMPLE_MS = 7 * 86_400_000;

/** Whether the page named `name` is due for a new sample. */
export function sampleDue(last: Record<string, number> | undefined, name: string | null, now: number, every = SAMPLE_MS): boolean {
  if (!name) return false;
  const at = last?.[name];
  return !at || now - at >= every;
}

/** A name safe to use as a file name: MC's page names are A-Z, digits and _. */
export function sampleFileName(name: string): string | null {
  return /^[A-Z][A-Z0-9_]{1,80}$/.test(name) ? `${name}.html` : null;
}

/**
 * The page's HTML without our own marks, scripts, event-handler attributes
 * or anything typed into fields. It is parsed into a separate, inert
 * document instead of cloning the live one: cloning MC's body, which carries
 * an onunload attribute, inside the page registers an unload handler, which MC's permissions
 * policy forbids ("Permissions policy violation: unload is not allowed in
 * this document", 0.0.79 test builds).
 */
export function snapshotHtml(doc: Document): string {
  const copy = new DOMParser().parseFromString(doc.documentElement.outerHTML, 'text/html');
  copy.querySelectorAll('[data-electric-mc], script, noscript').forEach((e) => e.remove());
  for (const el of Array.from(copy.querySelectorAll('*'))) {
    for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  }
  copy.querySelectorAll('input[type=password], input[type=text], input[type=email]').forEach((e) => e.setAttribute('value', ''));
  copy.querySelectorAll('textarea').forEach((e) => (e.textContent = ''));
  return '<!doctype html>\n' + copy.documentElement.outerHTML;
}
