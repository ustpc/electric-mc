// Opens a made-up proof PDF on a fake MC address in Chromium with the built
// extension, and checks that the word-count box appears with the right
// count. Uses only made-up content; nothing here touches the real MC.
//
//   npx tsx tools/e2e/pdf-words.mjs [build/chrome-mv3]

import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fakeManuscript, makePdf } from '../../tests/makepdf.ts';

const dir = resolve(process.argv[2] ?? 'build/chrome-mv3');
const profile = mkdtempSync(join(tmpdir(), 'emc-pdf-'));
const { runs, bodyWords } = fakeManuscript({ copies: 2 });
const pdf = Buffer.from(makePdf(runs));
let fetches = 0;

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
});
let failed = false;
try {
  await context.route('https://*.manuscriptcentral.com/**', (route) => {
    fetches++;
    return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'cache-control': 'private, max-age=600' }, body: pdf });
  });
  if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.goto('https://mc.manuscriptcentral.com/xyzj?DOWNLOAD=TRUE&PARAMS=made-up');
  const box = page.locator('[data-electric-mc-words]');
  await box.waitFor({ timeout: 20_000 });
  const text = await box.evaluate((e) => e.shadowRoot.textContent);
  const want = `${bodyWords.toLocaleString('en-US')} words`;
  console.log(`box: ${text}`);
  console.log(`requests for the PDF: ${fetches}`);
  if (!text.startsWith(want) || !text.includes('2 copies')) {
    console.error(`expected "${want}" and a second copy`);
    failed = true;
  }
} catch (e) {
  console.error(String(e));
  failed = true;
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
