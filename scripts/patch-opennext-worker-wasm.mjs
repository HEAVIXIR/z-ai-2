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
// into the Worker bundle root. Wrangler resolves /bundle/static/wasm from
// .open-next/static/wasm (not server-functions/default/static/wasm).
const nextStaticWasmDir = path.join(root, ".next", "server", "chunks", "static", "wasm");
const workerBundleWasmDir = path.join(root, ".open-next", "static", "wasm");
const webpackWasmFiles = (await readdir(nextStaticWasmDir).catch(() => []))
  .filter((file) => file.toLowerCase().endsWith(".wasm"));
if (webpackWasmFiles.length === 0) {
  throw new Error(
    "No Webpack-emitted WASM assets found at .next/server/chunks/static/wasm; refusing to produce an incomplete OpenNext Worker bundle.",
  );
}
await mkdir(workerBundleWasmDir, { recursive: true });
for (const file of webpackWasmFiles) {
  const bytes = await readFile(path.join(nextStaticWasmDir, file));
  await writeFile(path.join(workerBundleWasmDir, file), bytes);
}
console.log(
  "Copied " +
    webpackWasmFiles.length +
    " Webpack-emitted WASM assets into OpenNext Worker bundle root (.open-next/static/wasm)",
);

for (const relativePath of Object.values(wasmFiles)) {
  await access(path.join(root, relativePath));
}

const source = await readFile(workerPath, "utf8");
const marker = "/* HEAVIX_PRECOMPILED_WASM_MODULES_V2 */";

const imports = Object.entries(wasmFiles)
  .map(([name, relativePath]) => {
    const specifier = "../" + relativePath.replaceAll("\", "/");
    return "import " + name + " from " + JSON.stringify(specifier) + ";";
  })
  .join("\n");

const prismaWasmNames = webpackWasmFiles.map((_, index) => "PRISMA_QUERY_COMPILER_WASM_" + index);
const prismaWasmImports = webpackWasmFiles
  .map((file, index) =>
    "import " + prismaWasmNames[index] + " from " + JSON.stringify("./static/wasm/" + file) + ";",
  )
  .join("\n");
const prismaWasmRegistry = [
  "globalThis.__HEAVIX_PRISMA_QUERY_COMPILER_WASM_MODULES__ = Object.freeze({",
  ...webpackWasmFiles.map((file, index) =>
    "  " + JSON.stringify(path.basename(file, ".wasm")) + ": " + prismaWasmNames[index] + ",",
  ),
  "});",
].join("\n");

if (!source.includes(marker)) {
  const bootstrap = [
    marker,
    imports,
    prismaWasmImports,
    "globalThis.__HEAVIX_WASM_MODULES__ = Object.freeze({",
    "  JPEG_DEC_WASM,",
    "  PNG_WASM,",
    "  WEBP_DEC_WASM,",
    "  WEBP_ENC_WASM,",
    "  RESIZE_WASM,",
    "});",
    prismaWasmRegistry,
  ].join("\n");
  await writeFile(workerPath, bootstrap + "\n" + source, "utf8");
  console.log("Attached jSquash and Prisma WASM modules to OpenNext Worker entrypoint");
} else {
  console.log("HEAVIX WASM modules already attached to OpenNext Worker");
}

function patchPrismaWasmLoader(input, label) {
  if (input.includes("__HEAVIX_PRISMA_QUERY_COMPILER_WASM_MODULES__")) {
    return input;
  }
  const loaderMatch = /k\.v\s*=\s*\([^)]*\)\s*=>\s*new Promise/.exec(input);
  if (!loaderMatch) {
    throw new Error("Could not locate Prisma Webpack WASM loader in " + label);
  }
  const start = loaderMatch.index;
  const instantiateIndex = input.indexOf("WebAssembly.instantiate(", start);
  const assignIndex = input.indexOf("Object.assign(", instantiateIndex);
  if (instantiateIndex < 0 || assignIndex < 0) {
    throw new Error("Prisma WASM loader shape was not recognized in " + label);
  }
  const openParen = input.indexOf("(", assignIndex);
  let depth = 0;
  let end = -1;
  for (let index = openParen; index < input.length; index++) {
    if (input[index] === "(") depth++;
    else if (input[index] === ")") {
      depth--;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error("Could not find end of Prisma WASM loader in " + label);
  if (input[end] === ")") end++;

  const patchedLoader =
    "k.v=(exports,moduleId,hash,imports)=>Promise.resolve().then(()=>{" +
    "const module=globalThis.__HEAVIX_PRISMA_QUERY_COMPILER_WASM_MODULES__?.[hash];" +
    "if(!module)throw new Error(\"Missing precompiled Prisma WASM module: \"+hash);" +
    "return WebAssembly.instantiate(module,imports)" +
    "}).then(instance=>Object.assign(exports,instance.exports))";
  return input.slice(0, start) + patchedLoader + input.slice(end);
}

const prismaRuntimeFiles = [
  path.join(root, ".open-next", "server-functions", "default", ".next", "server", "webpack-runtime.js"),
  path.join(root, ".open-next", "server-functions", "default", "handler.mjs"),
];
for (const runtimePath of prismaRuntimeFiles) {
  let runtime = await readFile(runtimePath, "utf8");
  const patched = patchPrismaWasmLoader(runtime, path.relative(root, runtimePath));
  if (patched !== runtime) {
    await writeFile(runtimePath, patched, "utf8");
    console.log("Replaced Prisma fs.readFile WASM loader with compiled Worker module loader in " + path.relative(root, runtimePath));
  }
}
