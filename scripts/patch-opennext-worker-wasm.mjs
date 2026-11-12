import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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

// Next/Webpack emits Prisma's query-compiler WASM under .next/server/chunks/static/wasm.
// OpenNext traces the generated client source files, but the Worker runtime's readAll()
// loader resolves the emitted hash under /bundle/static/wasm. Copy those emitted files
// into the server-function bundle root so that readAll() can resolve them in workerd.
const nextStaticWasmDir = path.join(root, ".next", "server", "chunks", "static", "wasm");
const serverFunctionWasmDir = path.join(
  root,
  ".open-next",
  "server-functions",
  "default",
  "static",
  "wasm",
);
const webpackWasmFiles = (await readdir(nextStaticWasmDir).catch(() => []))
  .filter((file) => file.toLowerCase().endsWith(".wasm"));
if (webpackWasmFiles.length === 0) {
  throw new Error(
    "No Webpack-emitted WASM assets found at .next/server/chunks/static/wasm; refusing to produce an incomplete OpenNext Worker bundle.",
  );
}
await mkdir(serverFunctionWasmDir, { recursive: true });
for (const file of webpackWasmFiles) {
  const bytes = await readFile(path.join(nextStaticWasmDir, file));
  await writeFile(path.join(serverFunctionWasmDir, file), bytes);
}
console.log(
  "Copied " +
    webpackWasmFiles.length +
    " Webpack-emitted WASM assets into OpenNext server function bundle",
);

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
