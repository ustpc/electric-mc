// Loads the built extension into headless Chromium on a synthetic MC
// manuscript details page (Co-Chair, Assign AE) with one-button reject on,
// and fails unless the page is read as a manuscript page and the one-button
// controls appear. jsdom tests missed that in Chrome the parser's cleaned
// copy had no CURRENT_PAGE field (hidden inputs are display:none there).
// Made-up content only; nothing here touches the real Manuscript Central.
//
//   node tools/e2e/page-check.mjs [build/chrome-mv3]
//   CHROMIUM_PATH=/path/to/chrome to use a given browser.

import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'build/chrome-mv3');
const profile = mkdtempSync(join(tmpdir(), 'emc-page-'));
const PAGE = `<!doctype html><html><head><title>ScholarOne Manuscripts</title></head><body>
<ul class="breadcrumb"><li>Co-Chair Dashboard</li><li>Awaiting AE Assignment</li><li>Details for XYZJ-26-11-9001</li></ul>
<form name="mainForm"><input type="hidden" name="CURRENT_PAGE" value="ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS"></form>
<div><table><tr><td>XYZJ-26-11-9001</td><td>Submitted: 10-Nov-2026</td></tr><tr><td>A Made-Up Title</td></tr></table>
<p>AE: Not Assigned<br>CC: <a href="#">Co-Chair, Opinions</a><br>EIC: <a href="#">Chief, Robin</a></p>
<a href="#">PDF</a>
<table><tr><td>Associate Editor List</td></tr>
<tr><td>Pick from a list:</td><td><select name="XIK_WORKFLOW_ASSIGN_TO_1"><option value="">Select an AE (# Current Assignments)</option><option value="a">Editor, Pat (3)</option><option value="b">Co-Chair, Opinions (0)</option></select>
<a href="#"><img src="/images/view.gif"> View Details</a> <a href="#" id="assign"><img src="/images/assign.gif" alt="Assign"> Assign</a></td></tr></table></div>
</body></html>`;

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
});
let failed = false;
try {
  await context.route('https://*.manuscriptcentral.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  await worker.evaluate(async () => {
    const s = (await chrome.storage.sync.get('settings')).settings ?? {};
    await chrome.storage.sync.set({ settings: { ...s, oneButtonReject: true } });
  });
  const p = await context.newPage();
  let pageType = '';
  p.on('console', (m) => {
    const hit = /^\[electric-mc\] load (\S+)/.exec(m.text());
    if (hit) pageType = hit[1];
  });
  await p.goto('https://mc.manuscriptcentral.com/xyzj');
  await p.waitForTimeout(2500);
  const oneButton = await p.evaluate(() => !!document.querySelector('[data-electric-mc="one-button"]'));
  console.log(`page-check: read as ${pageType || '(nothing logged)'}, one-button controls ${oneButton ? 'shown' : 'missing'}`);
  failed = pageType !== 'manuscript' || !oneButton;
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
