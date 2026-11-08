// Loads the built extension into headless Chromium and fails if Chrome
// records any error for it: on first load, on a synthetic MC page, on other
// sites, and across two reloads (which is what an update does). Uses only
// made-up page content; nothing here touches the real Manuscript Central.
//
//   node tools/e2e/load-check.mjs [build/chrome-mv3]

import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'build/chrome-mv3');
const profile = mkdtempSync(join(tmpdir(), 'emc-load-'));
const MC = 'https://mc.manuscriptcentral.com/xyzj';
const FAKE_MC = `<!doctype html><html><head><title>ScholarOne Manuscripts</title></head><body>
<table width="760"><tr><td width="15%">View Manuscripts</td><td width="85%">
<p>Author Dashboard</p><table><tr><td>XYZJ-2026-0001.R1</td><td>A Made-Up Title</td><td>Editor, Pat</td></tr></table>
</td></tr></table></body></html>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
});
try {
  await context.route('https://*.manuscriptcentral.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_MC }));
  await context.route('https://example.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Another site</p>' }));

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  const id = new URL(worker.url()).host;

  // Errors are only collected in developer mode, so turn it on and reload
  // once before counting: that reload is also the "update" path.
  const ext = await context.newPage();
  await ext.goto('chrome://extensions');
  const dev = (fn, ...a) => ext.evaluate(([f, a]) => new Function('return ' + f)()(...a), [fn.toString(), a]);
  await dev(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
  await dev((id) => chrome.developerPrivate.deleteExtensionErrors({ extensionId: id }), id);

  const pages = [];
  for (const url of [MC + '/dashboard', 'https://example.org/', 'about:blank']) {
    const p = await context.newPage();
    p.on('pageerror', (e) => problems.push(`page error on ${url}: ${e.message}`));
    await p.goto(url);
    pages.push(p);
  }
  await sleep(2000);
  for (let i = 0; i < 2; i++) {
    await dev((id) => chrome.developerPrivate.reload(id, { failQuietly: false }), id);
    await sleep(3000);
    for (const p of pages) await p.bringToFront().catch(() => {});
    await pages[0].reload().catch(() => {});
    await sleep(1500);
  }
  await sleep(2000);
  const info = await dev((id) => chrome.developerPrivate.getExtensionInfo(id), id);
  for (const e of [...(info.manifestErrors ?? []), ...(info.runtimeErrors ?? [])]) {
    problems.push(`${e.type === 1 ? 'manifest' : 'runtime'} error in ${e.source || e.contextUrl || '?'}: ${e.message}`);
  }
  console.log(`Loaded ${info.name} ${info.version}; ${problems.length} error(s).`);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
for (const p of problems) console.error('  ' + p);
process.exit(problems.length ? 1 : 0);
