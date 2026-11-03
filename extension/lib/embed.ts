// On-device text embeddings for AE suggestions. The model (bge-small-en-v1.5,
// 8-bit) and the ONNX runtime are bundled in the extension under models/ and
// ort/ (scripts/fetch-model.mjs puts them there at build time), so nothing is
// downloaded at run time and no text leaves this computer. Runs in the side
// panel, which is an extension page; the manifest allows WebAssembly there.

import { MODEL_DTYPE, MODEL_ID, normalize } from './match';

type Extractor = (text: string, opts: { pooling: 'cls'; normalize: boolean }) => Promise<{ data: Float32Array }>;

let loading: Promise<Extractor> | null = null;

async function load(): Promise<Extractor> {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = chrome.runtime.getURL('models/');
  env.useBrowserCache = false;
  const wasm = env.backends.onnx.wasm!;
  wasm.wasmPaths = { mjs: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.mjs'), wasm: chrome.runtime.getURL('ort/ort-wasm-simd-threaded.wasm') };
  // Threads need cross-origin isolation, which extension pages don't have.
  wasm.numThreads = 1;
  return (await pipeline('feature-extraction', MODEL_ID, { dtype: MODEL_DTYPE, device: 'wasm' })) as unknown as Extractor;
}

/** Whether this build carries the model (test builds made without it don't). */
export async function modelBundled(): Promise<boolean> {
  try {
    const r = await fetch(chrome.runtime.getURL(`models/${MODEL_ID}/config.json`));
    return r.ok;
  } catch {
    return false;
  }
}

/** The text's unit-length embedding. The first call loads the model (a few seconds). */
export async function embed(text: string): Promise<Float32Array> {
  loading ??= load().catch((e) => {
    loading = null;
    throw e;
  });
  const extractor = await loading;
  // bge models use the [CLS] token's vector.
  const out = await extractor(text, { pooling: 'cls', normalize: true });
  return normalize(Float32Array.from(out.data));
}
