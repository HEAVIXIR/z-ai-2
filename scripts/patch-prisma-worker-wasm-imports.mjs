import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clients = [
  {
    key: "worker-client",
    file: path.join(root, "src", "lib", "generated", "worker-client", "internal", "class.ts"),
  },
  {
    key: "store-worker-client",
    file: path.join(root, "src", "lib", "generated", "store-worker-client", "internal", "class.ts"),
  },
];

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "\`") {
      quote = character;
      continue;
    }
    if (character === "{") depth++;
    else if (character === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

for (const client of clients) {
  let source = await readFile(client.file, "utf8");
  const marker = "__HEAVIX_PRISMA_QUERY_COMPILER_WASM_MODULES__";
  if (source.includes(marker)) {
    console.log("Prisma query compiler loader already patched for " + client.key);
    continue;
  }

  const start = source.indexOf("getQueryCompilerWasmModule");
  if (start < 0) throw new Error("Missing getQueryCompilerWasmModule in " + client.file);
  const arrow = source.indexOf("=>", start);
  const openBrace = source.indexOf("{", arrow);
  if (arrow < 0 || openBrace < 0) {
    throw new Error("Unrecognized getQueryCompilerWasmModule shape in " + client.file);
  }
  const closeBrace = findMatchingBrace(source, openBrace);
  if (closeBrace < 0) throw new Error("Unclosed query compiler loader in " + client.file);

  const original = source.slice(start, closeBrace + 1);
  if (!original.includes("query_compiler_bg.wasm?module")) {
    throw new Error("Expected Prisma ?module WASM loader was not found in " + client.file);
  }

  const replacement = [
    "getQueryCompilerWasmModule: async () => {",
    "  const wasmModule = (globalThis as any).__HEAVIX_PRISMA_QUERY_COMPILER_WASM_MODULES__?.[" + JSON.stringify(client.key) + "];",
    "  if (!wasmModule) throw new Error(" + JSON.stringify("Missing precompiled Prisma query compiler WASM module: " + client.key) + ");",
    "  return wasmModule;",
    "}",
  ].join("\n");
  source = source.slice(0, start) + replacement + source.slice(closeBrace + 1);
  await writeFile(client.file, source, "utf8");
  console.log("Patched Prisma getQueryCompilerWasmModule to use direct Worker module for " + client.key);
}
