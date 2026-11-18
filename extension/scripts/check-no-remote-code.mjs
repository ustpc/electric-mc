// Fails if the built extension could load code from the network. Chrome Web
// Store policy for Manifest V3: all code must ship in the package, so the
// package must not even contain a CDN address or a remote import. Runs after
// every build and zip (package.json), and in CI. See AGENTS.md, "Chrome Web
// Store policies".
//
//   node scripts/check-no-remote-code.mjs [build/chrome-mv3]

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

// Hosts that serve scripts, WebAssembly or models. Any mention fails, even in
// dead code: the store's scanner flags the string.
const HOSTS = [
  'cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'unpkg.com', 'esm.sh', 'esm.run', 'cdnjs.cloudflare.com',
  'cdn.skypack.dev', 'ga.jspm.io', 'jspm.dev', 'cdn.esm.sh', 'deno.land', 'raw.githubusercontent.com',
  'gist.githubusercontent.com', 'ajax.googleapis.com', 'code.jquery.com', 'cdn.tailwindcss.com',
  'storage.googleapis.com/tfjs', 'tfhub.dev', 'cdn-lfs.huggingface.co',
];
const host = new RegExp(`(?:https?:)?//(?:[a-z0-9-]+\\.)*(?:${HOSTS.map((h) => h.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})`, 'i');

const RULES = [
  { why: 'CDN address', re: host },
  // Model or code downloads from Hugging Face. Its /docs/ links in error
  // messages are text, not something the code loads.
  { why: 'Hugging Face address', re: /https?:\/\/huggingface\.co\/(?!docs\/)/i },
  { why: 'import() of a URL', re: /\bimport\s*\(\s*["'`]\s*(?:https?:)?\/\//i },
  { why: 'importScripts() of a URL', re: /\bimportScripts\s*\(\s*["'`]\s*(?:https?:)?\/\//i },
  { why: 'Worker from a URL', re: /\bnew\s+(?:Shared)?Worker\s*\(\s*["'`]\s*(?:https?:)?\/\//i },
  { why: 'static import from a URL', re: /\bfrom\s*["'`]\s*(?:https?:)?\/\//i },
  // Side-effect import with no "from": import "https://…";
  { why: 'side-effect import of a URL', re: /\bimport\s*["'`]\s*(?:https?:)?\/\//i },
  { why: 'script tag with a remote src', re: /<script\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i },
  { why: 'remote stylesheet or module preload', re: /<link\b[^>]*\bhref\s*=\s*["']?\s*(?:https?:)?\/\/[^>]*>/i },
];

const TEXT = /\.(?:m?js|cjs|html?|json|css|svg|txt)$/i;

/** Every remote-code finding in one file's text, as "line: why: …context…". */
export function scanText(text) {
  const out = [];
  for (const { why, re } of RULES) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(g)) {
      const line = text.slice(0, m.index).split('\n').length;
      const around = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 60).replace(/\s+/g, ' ');
      out.push(`${line}: ${why}: …${around}…`);
    }
  }
  return out;
}

// Sources a script policy may list. 'none' allows nothing, so it's fine too.
const ALLOWED = new Set(["'self'", "'wasm-unsafe-eval'", "'none'"]);
// Directives that decide where scripts and workers come from. default-src is
// the fallback when script-src or worker-src is missing; script-src-elem and
// script-src-attr override script-src; worker-src governs workers. Each one
// present must allow only the extension's own files.
const SCRIPT_DIRECTIVES = ['default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'worker-src'];

/** Problems with one CSP string, parsing directives by their full names. */
export function checkCsp(csp, where = 'CSP') {
  const out = [];
  const directives = new Map();
  for (const part of (csp ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    const key = name.toLowerCase();
    // The browser uses the first copy of a repeated directive; check them all.
    directives.set(key, [...(directives.get(key) ?? []), ...sources]);
  }
  for (const d of SCRIPT_DIRECTIVES) {
    for (const s of directives.get(d) ?? []) if (!ALLOWED.has(s.toLowerCase())) out.push(`${where}: ${d} allows ${s}`);
  }
  return out;
}

/** Problems with the manifest's content_security_policy (MV3 object form). */
export function checkManifest(manifest) {
  const csp = manifest.content_security_policy;
  if (csp == null) return []; // MV3's default policy allows only the extension's files.
  if (typeof csp === 'string') return checkCsp(csp, 'manifest.json content_security_policy');
  return Object.entries(csp).flatMap(([k, v]) => checkCsp(v, `manifest.json content_security_policy.${k}`));
}

async function* walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (TEXT.test(e.name)) yield p;
  }
}

/** All problems in a built extension directory. */
export async function checkDir(dir) {
  const problems = [];
  let files = 0;
  for await (const file of walk(dir)) {
    files++;
    for (const p of scanText(await readFile(file, 'utf8'))) problems.push(`${relative(dir, file)}:${p}`);
  }
  try {
    problems.push(...checkManifest(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))));
  } catch (e) {
    problems.push(`manifest.json: couldn't read it (${e.message})`);
  }
  if (files === 0) problems.push(`${dir}: no files to check. Build first.`);
  return { files, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? 'build/chrome-mv3';
  const { files, problems } = await checkDir(dir);
  if (problems.length) {
    process.stderr.write(`check-no-remote-code: ${problems.length} problem(s) in ${dir}. Chrome Web Store forbids remotely hosted code in MV3 (AGENTS.md).\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    process.exit(1);
  }
  process.stdout.write(`check-no-remote-code: ${files} files in ${dir}, no remote code\n`);
}
