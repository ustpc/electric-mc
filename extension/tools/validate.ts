// Run the parsers over captured pages and report what they found.
//
//   npm run validate -- <file-or-dir>... [--json] [--redact] [--mutate]
//
// Captures come from the side panel's "Capture page HTML" button and land in
// Downloads/electric-mc/captures. They contain real manuscript data, so keep
// them out of git (the .gitignore already excludes *.capture.html).
//
// --mutate also re-runs every capture under each simulated template change
// from tests/mutate.ts and reports any that change the page type.
// --redact prints the redacted form, which is what a user would send us.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { redactResult } from '../lib/log';
import { parsePage } from '../parsers';
import type { ParseResult } from '../parsers/types';
import { MUTATIONS } from '../tests/mutate';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const paths = args.filter((a) => !a.startsWith('--'));
if (!paths.length) {
  console.error('usage: npm run validate -- <capture.html | dir>... [--json] [--redact] [--mutate]');
  process.exit(2);
}

function files(p: string): string[] {
  if (statSync(p).isDirectory()) return readdirSync(p).flatMap((f) => files(join(p, f)));
  return /\.html?$/.test(p) ? [p] : [];
}

interface Meta { url?: string; pageType?: string; fingerprint?: string; parserVersion?: string }

function parseFile(file: string, mutate?: (d: Document) => void): { meta: Meta; r: ParseResult } {
  const html = readFileSync(file, 'utf8');
  const m = /<!-- electric-mc-capture (\{.*?\}) -->/.exec(html);
  const meta: Meta = m ? JSON.parse(m[1]!) : {};
  const url = meta.url ?? 'https://mc.manuscriptcentral.com/unknown';
  // Scripts were stripped at capture; don't run anything that's left.
  const dom = new JSDOM(html, { url, runScripts: undefined, virtualConsole: new VirtualConsole() });
  mutate?.(dom.window.document);
  return { meta, r: parsePage(dom.window.document, url) };
}

let problems = 0;
const out: unknown[] = [];
for (const file of paths.flatMap(files)) {
  const { meta, r } = parseFile(file);
  const notes: string[] = [];
  if (meta.pageType && meta.pageType !== r.pageType) notes.push(`page type changed: captured as ${meta.pageType}, now ${r.pageType}`);
  if (meta.fingerprint && meta.fingerprint !== r.fingerprint) notes.push('fingerprint differs from capture (expected if the file was edited)');
  if (r.pageType === 'unknown') notes.push('unknown page type');
  if (r.confidence < 0.5) notes.push(`low confidence ${r.confidence}`);

  const fragile: string[] = [];
  if (flags.has('--mutate')) {
    for (const [name, fn] of Object.entries(MUTATIONS)) {
      const m = parseFile(file, fn).r;
      if (m.pageType !== r.pageType) fragile.push(`${name} → ${m.pageType}`);
      else if (summaryOf(m) !== summaryOf(r)) fragile.push(`${name} → ${summaryOf(m)}`);
    }
  }
  if (notes.length || fragile.length || r.warnings.length) problems++;

  if (flags.has('--json')) {
    out.push({ file, meta, notes, fragile, result: flags.has('--redact') ? redactResult(r) : r });
    continue;
  }
  const flag = notes.length || fragile.length ? '✗' : r.warnings.length ? '!' : '✓';
  console.log(`${flag} ${file}`);
  console.log(`   ${r.pageType} ${Math.round(r.confidence * 100)}%  ${summaryOf(r)}  fp=${r.fingerprint}  ${r.elapsedMs}ms`);
  console.log(`   signals: ${r.signals.map((s) => `${s.pageType}:${s.name}+${s.weight}`).join(', ')}`);
  if (Object.keys(r.strategies).length) console.log(`   strategies: ${Object.entries(r.strategies).map(([k, v]) => `${k}=${v}`).join('; ')}`);
  for (const w of r.warnings) console.log(`   warning: ${w}`);
  for (const n of notes) console.log(`   problem: ${n}`);
  for (const f of fragile) console.log(`   fragile under: ${f}`);
}
if (flags.has('--json')) console.log(JSON.stringify(out, null, 2));
else console.log(`\n${problems} file(s) need a look.`);
process.exit(problems ? 1 : 0);

function summaryOf(r: ParseResult): string {
  if (r.manuscript) return `ms=${r.manuscript.id} title=${r.manuscript.title ? 'yes' : 'no'} reviewers=${r.manuscript.reviewers.length}`;
  if (r.rows) return `rows=${r.rows.length}`;
  if (r.queues) return `queues=${r.queues.length}`;
  return `ids=${r.manuscriptIds.length}`;
}
