/**
 * Load the exact jSquash WebAssembly codecs used by the Cloudflare Worker
 * before starting the isolated Node.js browser-acceptance server.
 *
 * This keeps the local Node test on the production image decode/resize/encode
 * implementation instead of bypassing it or substituting a different codec.
 * The module is loaded only by the dedicated WANTED E2E workflow.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wasmFiles = {
  JPEG_DEC_WASM: "node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm",
  PNG_WASM: "node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm",
  WEBP_DEC_WASM: "node_modules/@jsquash/webp/codec/dec/webp_dec.wasm",
  WEBP_ENC_WASM: "node_modules/@jsquash/webp/codec/enc/webp_enc.wasm",
  RESIZE_WASM: "node_modules/@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm",
};

const entries = await Promise.all(
  Object.entries(wasmFiles).map(async ([name, relativePath]) => {
    const bytes = await readFile(path.join(repositoryRoot, relativePath));
    if (bytes.length === 0) throw new Error("Empty image codec WASM module: " + name);
    return [name, await WebAssembly.compile(bytes)];
  }),
);

const modules = Object.freeze(Object.fromEntries(entries));
if (Object.keys(modules).length !== 5 ||
    Object.values(modules).some((module) => !(module instanceof WebAssembly.Module))) {
  throw new Error("HEAVIX image codec WASM bootstrap is incomplete.");
}

Object.defineProperty(globalThis, "__HEAVIX_WASM_MODULES__", {
  value: modules,
  configurable: false,
  enumerable: false,
  writable: false,
});

console.log("PASS: all five production jSquash WebAssembly codecs initialized for isolated Node E2E.");
