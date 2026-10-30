import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const generatedRoot = path.join(sourceRoot, "lib", "generated");
const excludedEntrypoints = new Set([
  path.join(sourceRoot, "lib", "store-db.ts"),
  path.join(sourceRoot, "lib", "store-db.node.ts"),
  path.join(sourceRoot, "lib", "store-db.worker.ts"),
  path.join(sourceRoot, "lib", "db.ts"),
  path.join(sourceRoot, "lib", "db.node.ts"),
  path.join(sourceRoot, "lib", "db.worker.ts"),
]);

function readTsConfig(fileName) {
  const configPath = path.join(root, fileName);
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) {
    throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"));
  }
  return ts.parseJsonConfigFileContent(loaded.config, ts.sys, root, undefined, configPath).options;
}

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      if (excludedEntrypoints.has(fullPath)) continue;
      if (entry.name.endsWith(".typecheck.ts") || entry.name.endsWith(".test.ts")) continue;
      files.push(fullPath);
    }
  }
  return files;
}

function runtimeModuleSpecifiers(sourceFile) {
  const specifiers = [];
  for (const node of sourceFile.statements) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) continue;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.name === undefined
          && clause.namedBindings.elements.length > 0
          && clause.namedBindings.elements.every((element) => element.isTypeOnly)) continue;
      if (ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      specifiers.push(node.moduleSpecifier.text);
    } else {
      const visit = (child) => {
        if (ts.isCallExpression(child) && child.arguments.length === 1
            && ts.isStringLiteral(child.arguments[0])
            && (child.expression.kind === ts.SyntaxKind.ImportKeyword
              || (ts.isIdentifier(child.expression) && child.expression.text === "require"))) {
          specifiers.push(child.arguments[0].text);
        }
        ts.forEachChild(child, visit);
      };
      visit(node);
    }
  }
  return specifiers;
}

function verifyTarget({ name, config, expectedClient, forbiddenClient, expectedEntrypoint, forbiddenEntrypoint }) {
  const options = readTsConfig(config);
  const pending = collectSourceFiles(sourceRoot);
  const visited = new Set();
  const generatedImportEdges = [];
  while (pending.length) {
    const fileName = path.resolve(pending.pop());
    if (visited.has(fileName)) continue;
    visited.add(fileName);
    const source = ts.createSourceFile(fileName, fs.readFileSync(fileName, "utf8"), ts.ScriptTarget.Latest, true);
    for (const specifier of runtimeModuleSpecifiers(source)) {
      const resolved = ts.resolveModuleName(specifier, fileName, options, ts.sys).resolvedModule?.resolvedFileName;
      if (!resolved) continue;
      const absolute = path.resolve(resolved);
      if (absolute.startsWith(sourceRoot + path.sep) && !absolute.startsWith(generatedRoot + path.sep)) {
        pending.push(absolute);
      } else if (absolute.startsWith(generatedRoot + path.sep)) {
        visited.add(absolute);
        generatedImportEdges.push({ from: fileName.replaceAll(path.sep, "/"), specifier, resolved: absolute.replaceAll(path.sep, "/") });
      }
    }
  }

  const graph = [...visited].map((file) => file.replaceAll(path.sep, "/"));
  const forbiddenClientHits = graph.filter((file) => file.includes(forbiddenClient));
  const expectedClientHits = graph.filter((file) => file.includes(expectedClient));
  const expectedEntryHits = graph.filter((file) => file.endsWith(expectedEntrypoint));
  const forbiddenEntryHits = graph.filter((file) => file.endsWith(forbiddenEntrypoint));
  if (forbiddenClientHits.length || forbiddenEntryHits.length || !expectedClientHits.length || !expectedEntryHits.length) {
    console.error(JSON.stringify({
      target: name,
      graphModules: graph.length,
      expectedClientHits,
      forbiddenClientHits,
      expectedEntryHits,
      forbiddenEntryHits,
      forbiddenClientImportEdges: generatedImportEdges.filter((edge) => edge.resolved.includes(forbiddenClient)),
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${name}: ${graph.length} runtime source modules; selected ${expectedClient}; excluded ${forbiddenClient}`);
}

verifyTarget({
  name: "Node",
  config: "tsconfig.json",
  expectedClient: "/generated/store-node-client/",
  forbiddenClient: "/generated/store-client/",
  expectedEntrypoint: "/store-db.node.ts",
  forbiddenEntrypoint: "/store-db.worker.ts",
});
verifyTarget({
  name: "Cloudflare Worker",
  config: "tsconfig.store-worker.json",
  expectedClient: "/generated/store-client/",
  forbiddenClient: "/generated/store-node-client/",
  expectedEntrypoint: "/store-db.worker.ts",
  forbiddenEntrypoint: "/store-db.node.ts",
});
verifyTarget({
  name: "Node Main",
  config: "tsconfig.json",
  expectedClient: "/generated/node-client/",
  forbiddenClient: "/generated/client/",
  expectedEntrypoint: "/db.node.ts",
  forbiddenEntrypoint: "/db.worker.ts",
});
verifyTarget({
  name: "Cloudflare Worker Main",
  config: "tsconfig.store-worker.json",
  expectedClient: "/generated/client/",
  forbiddenClient: "/generated/node-client/",
  expectedEntrypoint: "/db.worker.ts",
  forbiddenEntrypoint: "/db.node.ts",
});
if (process.exitCode) process.exit(process.exitCode);
