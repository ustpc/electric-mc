#!/usr/bin/env node
// Stops real Manuscript Central data from being committed (AGENTS.md: "Real
// data never goes in this repository"). No dependencies; runs in CI, in the
// pre-commit and commit-msg hooks (make install-hooks) and in make check.
//
//   node tools/privacy/check-no-real-data.mjs            every tracked file
//   node tools/privacy/check-no-real-data.mjs --staged   what is about to be committed
//   node tools/privacy/check-no-real-data.mjs --message FILE   a commit message
//
// Everywhere it checks the shape of the data: manuscript IDs whose number is
// outside the synthetic ranges (1000-1999, 9000-9999), email addresses outside
// example.org/.com/.net, and files that are captures (mbox, eml, har, var/).
// On a computer with real data in var/ (Simson's), it also checks for the
// names, emails and manuscript IDs found there. It never prints what matched,
// only the file, the line and what kind of thing it was, so its own output
// can't leak.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ALLOW_FILE = join(ROOT, 'tools/privacy/allow.txt');

// Same shape as extension/lib/ids.ts DEFAULT_ID_PATTERN.
export const ID = /\b([A-Z][A-Z0-9]{1,15}(?:-[A-Z]{1,6})?-\d{2,4}(?:-\d{2})?-(\d{3,6}))(?:\.R\d{1,2})?\b/g;
export const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const SAFE_EMAIL = /@(example\.(org|com|net)|anthropic\.com|users\.noreply\.github\.com)$/i;
const CAPTURE_FILE = /(^|\/)var\/|\.(mbox|eml|har)$/i;
// Lock files and binaries hold hashes and base64 that look like anything.
const SKIP = /(^|\/)(package-lock\.json|Cargo\.lock)$|\.(png|jpe?g|gif|ico|pdf|zip|tgz|gz|wasm|onnx|bin|woff2?|ttf)$/i;

/** True for a manuscript number we use in synthetic data. */
export function syntheticNumber(n) {
  const v = Number(n);
  return (v >= 1000 && v <= 1999) || (v >= 9000 && v <= 9999);
}

function allowList() {
  if (!existsSync(ALLOW_FILE)) return new Set();
  return new Set(
    readFileSync(ALLOW_FILE, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean),
  );
}

/**
 * Real names, emails and IDs from var/ on this computer, if any. Read
 * locally, never printed. Names only count as "First Last" or "Last, First"
 * pairs of at least 3 letters each, so common words don't match.
 */
export function localSecrets(varDir = join(ROOT, 'var')) {
  const out = { names: new Set(), emails: new Set(), ids: new Set() };
  if (!existsSync(varDir)) return out;
  const addPerson = (first, last) => {
    const f = String(first ?? '').trim();
    const l = String(last ?? '').trim();
    if (f.length < 3 || l.length < 3) return;
    out.names.add(`${f} ${l}`.toLowerCase());
    out.names.add(`${l}, ${f}`.toLowerCase());
  };
  const addEmails = (text) => {
    for (const m of text.matchAll(EMAIL)) if (!SAFE_EMAIL.test(m[0])) out.emails.add(m[0].toLowerCase());
  };
  const addIds = (text) => {
    for (const m of text.matchAll(ID)) if (!syntheticNumber(m[2])) out.ids.add(m[1]);
  };
  const walkJson = (v) => {
    if (Array.isArray(v)) return v.forEach(walkJson);
    if (!v || typeof v !== 'object') return;
    const name = typeof v.name === 'string' ? v.name : typeof v.mcName === 'string' ? v.mcName : null;
    if (name) {
      const comma = name.indexOf(',');
      if (comma > 0) addPerson(name.slice(comma + 1), name.slice(0, comma));
      else {
        const w = name.trim().split(/\s+/);
        if (w.length >= 2) addPerson(w[0], w[w.length - 1]);
      }
    }
    Object.values(v).forEach(walkJson);
  };
  for (const f of readdirSync(varDir)) {
    const p = join(varDir, f);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > 200 * 1024 * 1024) continue;
    try {
      if (/\.json$/i.test(f)) {
        const text = readFileSync(p, 'utf8');
        addEmails(text);
        walkJson(JSON.parse(text));
      } else if (/\.log$/i.test(f)) {
        const text = readFileSync(p, 'utf8');
        addEmails(text);
        addIds(text);
      } else if (/\.xls$/i.test(f)) {
        // MC's "export" is UTF-16 tab-separated text with a .xls name.
        const buf = readFileSync(p);
        const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
        addEmails(text);
        const rows = text.split(/\r?\n/).map((r) => r.split('\t'));
        const head = (rows[0] ?? []).map((h) => h.toLowerCase());
        const fi = head.findIndex((h) => /first name/.test(h));
        const li = head.findIndex((h) => /last name/.test(h));
        if (fi >= 0 && li >= 0) for (const r of rows.slice(1)) addPerson(r[fi], r[li]);
      }
    } catch {
      /* unreadable or not what we expected: skip it */
    }
  }
  return out;
}

/** Problems in one text, as {line, kind}; never the matched value. */
export function scanText(text, allow = new Set(), secrets = null) {
  const problems = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(ID)) {
      if (!syntheticNumber(m[2]) && !allow.has(m[1])) problems.push({ line: i + 1, kind: 'manuscript ID outside the synthetic ranges' });
    }
    for (const m of line.matchAll(EMAIL)) {
      if (!SAFE_EMAIL.test(m[0]) && !allow.has(m[0].toLowerCase())) problems.push({ line: i + 1, kind: 'email address outside example.org' });
    }
    if (secrets) {
      const low = line.toLowerCase();
      for (const id of line.match(ID) ?? []) if (secrets.ids.has(id.replace(/\.R\d+$/, ''))) problems.push({ line: i + 1, kind: 'a manuscript ID from var/' });
      for (const e of low.match(EMAIL) ?? []) if (secrets.emails.has(e)) problems.push({ line: i + 1, kind: 'an email address from var/' });
      for (const n of secrets.names) if (low.includes(n)) {
        problems.push({ line: i + 1, kind: 'a person named in var/' });
        break;
      }
    }
  });
  return problems;
}

function git(args, input) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', input, maxBuffer: 512 * 1024 * 1024 });
}

function main(argv) {
  const allow = allowList();
  const secrets = localSecrets();
  const local = secrets.names.size + secrets.emails.size + secrets.ids.size > 0;
  const found = [];
  const msgAt = argv.indexOf('--message');
  if (msgAt >= 0) {
    const text = readFileSync(argv[msgAt + 1], 'utf8').replace(/^#.*$/gm, '');
    for (const p of scanText(text, allow, local ? secrets : null)) found.push({ file: 'commit message', ...p });
  } else {
    const staged = argv.includes('--staged');
    const files = (staged ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']) : git(['ls-files'])).split('\n').filter(Boolean);
    for (const f of files) {
      if (CAPTURE_FILE.test(f)) {
        found.push({ file: f, line: 0, kind: 'a capture or var/ file' });
        continue;
      }
      if (SKIP.test(f) || f === 'tools/privacy/allow.txt') continue;
      let text;
      try {
        text = staged ? git(['show', `:${f}`]) : readFileSync(join(ROOT, f), 'utf8');
      } catch {
        continue;
      }
      if (text.includes('\0')) continue; // binary
      for (const p of scanText(text, allow, local ? secrets : null)) found.push({ file: f, ...p });
    }
  }
  const where = local ? 'shapes and the real data in var/' : 'shapes only (no var/ here)';
  if (!found.length) {
    console.log(`check-no-real-data: OK (${where})`);
    return 0;
  }
  console.error(`check-no-real-data: ${found.length} possible real-data item(s) (${where}). Values are not shown.`);
  for (const p of found.slice(0, 200)) console.error(`  ${p.file}${p.line ? `:${p.line}` : ''}: ${p.kind}`);
  console.error('Replace them with synthetic data (AGENTS.md). A synthetic example that trips the check can go in tools/privacy/allow.txt.');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
