// pdf.js ships no types for its worker module; it is only loaded so pdf.js
// can run its worker code in the same thread (globalThis.pdfjsWorker).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
