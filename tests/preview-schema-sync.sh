#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HEAVIX_ROOT="$ROOT" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.env.HEAVIX_ROOT;
let main = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
let preview = fs.readFileSync(path.join(root, "prisma/preview-schema.prisma"), "utf8");

// The main schema has one additional Workerd-only generated client. The
// Preview schema intentionally uses SQLite and its own generated Node client.
main = main.replace(/^generator workerClient\s*\{[\s\S]*?^\}\s*/m, "");
const previewLines = preview.split(/\r?\n/);
previewLines[0] = "// HEAVIX — Industrial heavy-machinery marketplace";
previewLines[1] = "// SQLite development schema (PostgreSQL for production — switch provider + url for deployment)";
preview = previewLines.join("\n")
  .replace(/^[ \t]*output[ \t]*=[ \t]*"\.\.\/src\/lib\/generated\/preview-sqlite-client"[ \t]*\r?\n/m, "")
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace('url      = env("PREVIEW_DATABASE_URL")', 'url      = env("DATABASE_URL")');

function withoutComments(line) {
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === "/" && line[i + 1] === "/") return line.slice(0, i).trim();
  }
  return line.trim();
}

function braceDelta(line) {
  let quoted = false;
  let escaped = false;
  let delta = 0;
  for (const ch of line) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === "{") delta++;
    if (!quoted && ch === "}") delta--;
  }
  return delta;
}

function parseSchema(source, label) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = withoutComments(lines[i++]);
    if (!line) continue;

    const match = line.match(/^(generator|datasource|model|enum|type|view)\s+([A-Za-z_]\w*)\s*\{/);
    if (!match) throw new Error(`${label}: unsupported top-level declaration: ${line}`);

    let depth = braceDelta(line);
    const body = [];
    while (depth > 0 && i < lines.length) {
      const bodyLine = withoutComments(lines[i++]);
      if (!bodyLine) continue;
      const delta = braceDelta(bodyLine);
      depth += delta;
      if (depth > 0) body.push(bodyLine);
    }
    if (depth !== 0) throw new Error(`${label}: unbalanced block ${match[1]} ${match[2]}`);

    // Prisma model declaration order and field order are not semantic. Sort
    // model members so equivalent schemas compare equal even after refactors.
    // Enum value order is preserved because it can affect database enum order.
    if (match[1] === "model") body.sort((a, b) => a.localeCompare(b));

    blocks.push({ kind: match[1], name: match[2], body });
  }

  const keys = blocks.map(block => `${block.kind}:${block.name}`);
  if (new Set(keys).size !== keys.length) throw new Error(`${label}: duplicate schema declarations found`);
  return blocks;
}

function canonicalize(blocks) {
  return blocks
    .slice()
    .sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`))
    .map(block => `${block.kind} ${block.name} {\n${block.body.join("\n")}\n}`)
    .join("\n\n");
}

const mainBlocks = parseSchema(main, "Main");
const previewBlocks = parseSchema(preview, "Preview");
const mainCanonical = canonicalize(mainBlocks);
const previewCanonical = canonicalize(previewBlocks);

if (mainCanonical !== previewCanonical) {
  const left = mainCanonical.split("\n");
  const right = previewCanonical.split("\n");
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index++;
  console.error("Preview schema differs structurally from Main schema.");
  console.error(`First difference at normalized line ${index + 1}:`);
  console.error("Main:");
  console.error(left.slice(Math.max(0, index - 4), index + 12).join("\n"));
  console.error("Preview:");
  console.error(right.slice(Math.max(0, index - 4), index + 12).join("\n"));
  process.exit(1);
}

const modelCount = mainBlocks.filter(block => block.kind === "model").length;
console.log(`Preview schema structurally matches Main: ${modelCount} models; model/field ordering normalized; enum value ordering preserved.`);
NODE
