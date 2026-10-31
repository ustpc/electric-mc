// Puts the embedding model and the ONNX runtime into public/ so the build
// bundles them (MV3 forbids loading code or models from the network at run
// time). The model comes from Hugging Face once and is kept in
// public/models/, which git ignores; the runtime is copied from
// node_modules. Run by "npm run build" and "npm run zip"; safe to run again.
// SKIP_MODEL=1 builds without the model: AE suggestions then say so.

import { copyFile, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'Xenova/bge-small-en-v1.5';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'];
const ORT = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

const exists = (p) => stat(p).then(() => true, () => false);

async function fetchModel() {
  const dir = join(root, 'public', 'models', MODEL);
  for (const f of FILES) {
    const dest = join(dir, f);
    if (await exists(dest)) continue;
    const url = `https://huggingface.co/${MODEL}/resolve/main/${f}`;
    process.stdout.write(`fetch-model: ${url}\n`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(`${dest}.part`, Buffer.from(await r.arrayBuffer()));
    await rename(`${dest}.part`, dest);
  }
}

async function copyRuntime() {
  const dir = join(root, 'public', 'ort');
  await mkdir(dir, { recursive: true });
  for (const f of ORT) await copyFile(join(root, 'node_modules', 'onnxruntime-web', 'dist', f), join(dir, f));
}

await copyRuntime();
if (process.env.SKIP_MODEL) {
  process.stdout.write('fetch-model: SKIP_MODEL set, building without the embedding model\n');
} else {
  try {
    await fetchModel();
  } catch (e) {
    process.stderr.write(`fetch-model: couldn't download the model (${e.message}).\nSet SKIP_MODEL=1 to build without AE suggestions.\n`);
    process.exit(1);
  }
}
