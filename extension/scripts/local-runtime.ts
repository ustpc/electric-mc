// Vite plugin: keeps Transformers.js from carrying any address it could load
// code or models from. Chrome Web Store policy for Manifest V3 forbids
// remotely hosted code, and its reviewers flagged the line in Transformers.js
// that points ONNX's WebAssembly runtime at cdn.jsdelivr.net when nothing
// else is set (warning "Blue Argon", 2026-11-18). lib/embed.ts always set our
// own paths before loading the model, so that address was never used, but the
// package must not contain it at all.
//
// The patches below make the library's defaults the extension's own files:
// the runtime comes from ort/ (copied there by scripts/fetch-model.mjs) and
// models only from models/, never from huggingface.co. Each patch must match;
// if a Transformers.js upgrade changes the code, the build stops here instead
// of quietly shipping the CDN address again. scripts/check-no-remote-code.mjs
// then checks the whole built extension.

import type { Plugin } from 'vite';

const PATCHES: { what: string; from: RegExp; to: string }[] = [
  {
    what: 'ONNX runtime CDN address',
    from: /`https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@\$\{[^}]+\}\/dist\/`/,
    // Extension pages resolve /ort/ to the bundled runtime.
    to: '"/ort/"',
  },
  {
    // We bundle the plain build, not the asyncify one.
    what: 'ONNX runtime asyncify suffix',
    from: /let wasmPathSuffix = "\.asyncify";/,
    to: 'let wasmPathSuffix = "";',
  },
  { what: 'remote model switch', from: /allowRemoteModels: true,/, to: 'allowRemoteModels: false,' },
  { what: 'Hugging Face model host', from: /remoteHost: "https:\/\/huggingface\.co\/",/, to: 'remoteHost: "",' },
];

export function localRuntime(): Plugin {
  return {
    name: 'emc-local-runtime',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]@huggingface[\\/]transformers[\\/]dist[\\/]transformers\.web\.js$/.test(id.replace(/\?.*$/, ''))) return null;
      let out = code;
      for (const p of PATCHES) {
        if (!p.from.test(out)) this.error(`local-runtime: couldn't find the ${p.what} in ${id}. Transformers.js changed; update scripts/local-runtime.ts.`);
        out = out.replace(p.from, p.to);
      }
      return { code: out, map: null };
    },
  };
}
