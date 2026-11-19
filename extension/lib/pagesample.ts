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
