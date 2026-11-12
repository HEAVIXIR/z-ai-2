import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(root, ".open-next", "worker.js");
const marker = "/* HEAVIX_PRECOMPILED_WASM_MODULES_V3 */";

const wasmClients = [
  {
    key: "worker-client",
    name: "PRISMA_WORKER_CLIENT_WASM",
    source: path.join(root, "src", "lib", "generated", "worker-client", "internal", "query_compiler_bg.wasm"),
  },
  {
    key: "store-worker-client",
    name: "PRISMA_STORE_WORKER_CLIENT_WASM",
    source: path.join(root, "src", "lib", "generated", "store-worker-client", "internal", "query_compiler_bg.wasm"),
  },
];

for (const client of wasmClients) {
  const info = await stat(client.source);
  if (info.size === 0) throw new Error("Generated Prisma WASM file is empty: " + client.source);
  const classPath = path.join(root, "src", "lib", "generated", client.key, "internal", "class.ts");
  const classSource = await readFile(classPath, "utf8");
  if (!classSource.includes("__HEAVIX_PRISMA_QUERY_COMPILER_WASM_MODULES__")) {
    throw new Error("Prisma client loader was not patched before Next build: " + client.key);
  }
}

const wasmFiles = {
  JPEG_DEC_WASM: "../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm",
  PNG_WASM: "../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm",
  WEBP_DEC_WASM: "../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm",
  WEBP_ENC_WASM: "../node_modules/@jsquash/webp/codec/enc/webp_enc.wasm",
  RESIZE_WASM: "../node_modules/@jsquash/resize/codec/pkg/squoosh_resize_bg.wasm",
};

const imports = Object.entries(wasmFiles)
  .map(([name, relativePath]) => {
    const specifier = "../" + relativePath.replaceAll("\\", "/").replace(/^\.\.\//, "");
    return "import " + name + " from " + JSON.stringify(specifier) + ";";
  })
  .join("\n");

const prismaImports = wasmClients
  .map((client) =>
    "import " + client.name + " from " +
    JSON.stringify("../src/lib/generated/" + client.key + "/internal/query_compiler_bg.wasm") + ";",
  )
  .join("\n");

const prismaRegistry = [
  "globalThis.__HEAVIX_PRISMA_QUERY_COMPILER_WASM_MODULES__ = Object.freeze({",
  ...wasmClients.map((client) => "  " + JSON.stringify(client.key) + ": " + client.name + ","),
  "});",
].join("\n");

const source = await readFile(workerPath, "utf8");
if (source.includes(marker)) {
  if (!source.includes("__HEAVIX_PRISMA_QUERY_COMPILER_WASM_MODULES__")) {
    throw new Error("WASM marker exists without Prisma module registry.");
  }
  console.log("HEAVIX direct Prisma and jSquash WASM modules already attached");
} else {
  const bootstrap = [
    marker,
    imports,
    prismaImports,
    "globalThis.__HEAVIX_WASM_MODULES__ = Object.freeze({",
    "  JPEG_DEC_WASM,",
    "  PNG_WASM,",
    "  WEBP_DEC_WASM,",
    "  WEBP_ENC_WASM,",
    "  RESIZE_WASM,",
    "});",
    prismaRegistry,
  ].join("\n");
  await writeFile(workerPath, bootstrap + "\n" + source, "utf8");
  console.log("Attached jSquash and direct Prisma WebAssembly.Module imports to OpenNext Worker");
}
