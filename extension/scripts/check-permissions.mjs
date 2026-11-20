// Fails when the built manifest asks Chrome for anything not listed in
// permissions.json: a permission, a host, an optional permission, a content
// script match, a web-accessible resource or an externally_connectable
// entry. AGENTS.md: every new permission is flagged to Simson first; the
// allowlist changes in the same commit, so the change shows in review. Runs
// after every build and zip (package.json), and in CI.
//
//   node scripts/check-permissions.mjs [build/chrome-mv3]

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** What a manifest asks for, as sorted string lists. */
export function asks(manifest) {
  const uniq = (xs) => [...new Set(xs)].sort();
  return {
    permissions: uniq(manifest.permissions ?? []),
    host_permissions: uniq(manifest.host_permissions ?? []),
    optional_permissions: uniq(manifest.optional_permissions ?? []),
    optional_host_permissions: uniq(manifest.optional_host_permissions ?? []),
    content_script_matches: uniq((manifest.content_scripts ?? []).flatMap((c) => c.matches ?? [])),
    web_accessible_resources: uniq((manifest.web_accessible_resources ?? []).flatMap((w) => [...(w.resources ?? []).map((r) => `resource ${r}`), ...(w.matches ?? []).map((m) => `match ${m}`)])),
    externally_connectable: uniq(Object.values(manifest.externally_connectable ?? {}).flat().map(String)),
  };
}

/** Entries the manifest asks for that the allowlist doesn't have. */
export function extra(manifest, allowed) {
  const got = asks(manifest);
  const out = [];
  for (const [kind, list] of Object.entries(got)) for (const x of list) if (!(allowed[kind] ?? []).includes(x)) out.push(`${kind}: ${x}`);
  return out;
}

/** "store" for the Web Store build (its name has no "test build"), else "test". */
export function flavor(manifest) {
  return /test build/i.test(manifest.name ?? '') ? 'test' : 'store';
}

async function main() {
  const dir = process.argv[2] ?? 'build/chrome-mv3';
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const allow = JSON.parse(await readFile(new URL('../permissions.json', import.meta.url), 'utf8'));
  const which = flavor(manifest);
  const bad = extra(manifest, allow[which] ?? {});
  if (bad.length) {
    console.error(`check-permissions: the ${which} build asks for what permissions.json doesn't allow:`);
    for (const b of bad) console.error(`  ${b}`);
    console.error('Flag the new permission to Simson first (AGENTS.md), then add it to permissions.json in the same commit.');
    process.exit(1);
  }
  console.log(`check-permissions: OK (${which} build)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
