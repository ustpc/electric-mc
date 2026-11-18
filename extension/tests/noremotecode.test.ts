// The Chrome Web Store build gate (scripts/check-no-remote-code.mjs). The
// cases are synthetic; each is a way a package could load code remotely.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCsp, checkDir, checkManifest, scanText } from '../scripts/check-no-remote-code.mjs';

describe('scanText', () => {
  it.each([
    ['CDN address', 'const u = `https://cdn.jsdelivr.net/npm/x@1/dist/`;'],
    ['CDN address', 'fetch("//unpkg.com/x")'],
    ['Hugging Face address', 'remoteHost: "https://huggingface.co/"'],
    ['import() of a URL', 'await import("https://example.org/m.js")'],
    ['importScripts() of a URL', "importScripts('https://example.org/w.js')"],
    ['Worker from a URL', 'new Worker("https://example.org/w.js")'],
    ['static import from a URL', 'import { a } from "https://example.org/module.js";'],
    ['static import from a URL', 'export * from "https://example.org/module.js";'],
    ['side-effect import of a URL', 'import "https://example.org/module.js";'],
    ['side-effect import of a URL', "import'//example.org/module.js'"],
    ['script tag with a remote src', '<script src="https://example.org/a.js"></script>'],
  ])('flags %s: %s', (why, text) => {
    expect(scanText(text).join('\n')).toContain(why);
  });

  it.each([
    'import { a } from "./local.js";',
    'import "./side-effect.js";',
    'await import(chrome.runtime.getURL("ort/ort-wasm-simd-threaded.mjs"))',
    'throw Error("see https://huggingface.co/docs/transformers.js/guides")',
    'const ns = "http://www.w3.org/2000/svg";',
  ])('passes local or non-code text: %s', (text) => {
    expect(scanText(text)).toEqual([]);
  });
});

describe('checkCsp', () => {
  it('passes the shipped policy', () => {
    expect(checkCsp("script-src 'self' 'wasm-unsafe-eval'; object-src 'self';")).toEqual([]);
  });

  it.each([
    ["script-src 'self' https://example.org;", 'script-src allows https://example.org'],
    // No script-src: scripts fall back to default-src.
    ['default-src https://example.org;', 'default-src allows https://example.org'],
    // script-src-elem overrides script-src for script elements.
    ["script-src 'self'; script-src-elem https://example.org;", 'script-src-elem allows https://example.org'],
    ["script-src 'self'; script-src-attr 'unsafe-inline';", "script-src-attr allows 'unsafe-inline'"],
    ["script-src 'self'; worker-src https:;", 'worker-src allows https:'],
    // The directive name must match in full, not as a prefix.
    ["script-src-elem https://example.org; script-src 'self';", 'script-src-elem allows https://example.org'],
    ["SCRIPT-SRC 'self' 'unsafe-eval';", "script-src allows 'unsafe-eval'"],
  ])('flags %s', (csp, problem) => {
    expect(checkCsp(csp).join('\n')).toContain(problem);
  });

  it('checks every policy in the manifest, including sandbox', () => {
    expect(checkManifest({})).toEqual([]);
    expect(checkManifest({ content_security_policy: { extension_pages: "script-src 'self'", sandbox: 'sandbox; default-src https://example.org' } }).join('\n')).toContain(
      'content_security_policy.sandbox: default-src allows https://example.org',
    );
  });
});

describe('checkDir', () => {
  async function build(files: Record<string, string>) {
    const dir = await mkdtemp(join(tmpdir(), 'emc-remote-'));
    for (const [name, text] of Object.entries(files)) {
      await mkdir(join(dir, name, '..'), { recursive: true });
      await writeFile(join(dir, name), text);
    }
    return dir;
  }
  const manifest = JSON.stringify({ manifest_version: 3, content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';" } });

  it('passes a clean build', async () => {
    const dir = await build({ 'manifest.json': manifest, 'chunks/a.js': 'import "./b.js";' });
    expect((await checkDir(dir)).problems).toEqual([]);
    await rm(dir, { recursive: true });
  });

  it('fails on a side-effect remote import and names the file', async () => {
    const dir = await build({ 'manifest.json': manifest, 'chunks/a.js': 'import "https://example.org/module.js";' });
    expect((await checkDir(dir)).problems.join('\n')).toContain('chunks/a.js:1: side-effect import of a URL');
    await rm(dir, { recursive: true });
  });

  it('fails on a widened manifest CSP', async () => {
    const bad = JSON.stringify({ content_security_policy: { extension_pages: "script-src 'self'; script-src-elem https://example.org;" } });
    const dir = await build({ 'manifest.json': bad, 'chunks/a.js': '' });
    expect((await checkDir(dir)).problems.join('\n')).toContain('script-src-elem allows https://example.org');
    await rm(dir, { recursive: true });
  });
});
