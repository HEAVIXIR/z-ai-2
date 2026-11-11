import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(root, ".open-next", "worker.js");
const wasmFiles = {
  JPEG_DEC_WASM: "node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm",
  PNG_WASM: "node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm",
  WEBP_DEC_WASM: "node_modules/@jsquash/webp/codec/dec/webp_dec.wasm",
  WEBP_ENC_WASM: "node_modules/@jsquash/webp/codec/enc/webp_enc.wasm",
  RESIZE_WASM: "node_modules/@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm",
};

await access(workerPath);
for (const relativePath of Object.values(wasmFiles)) {
  await access(path.join(root, relativePath));
}

const source = await readFile(workerPath, "utf8");
const marker = "/* HEAVIX_PRECOMPILED_WASM_MODULES */";
if (source.includes(marker)) {
  console.log("HEAVIX WASM modules already attached to OpenNext Worker");
  process.exit(0);
}

const imports = Object.entries(wasmFiles)
  .map(([name, relativePath]) => {
    const specifier = "../" + relativePath.replaceAll("\\", "/");
    return "import " + name + " from " + JSON.stringify(specifier) + ";";
  })
  .join("\n");

const bootstrap = [
  marker,
  imports,
  "globalThis.__HEAVIX_WASM_MODULES__ = Object.freeze({",
  "  JPEG_DEC_WASM,",
  "  PNG_WASM,",
  "  WEBP_DEC_WASM,",
  "  WEBP_ENC_WASM,",
  "  RESIZE_WASM,",
  "});",
].join("\n");

await writeFile(workerPath, bootstrap + "\n" + source, "utf8");
console.log("Attached five precompiled jSquash WASM modules to OpenNext Worker entrypoint");
