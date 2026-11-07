import { constants, promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const UPLOAD_ROOT = path.join(ROOT, "public", "uploads");
const PRIVATE_ROOT = path.join(ROOT, ".heavix-media-metadata");
const SUFFIX = ".meta.json";
const APPLY = process.argv.includes("--apply");

type Sidecar = {
  id: string;
  filename: string;
  url: string;
  relativePath: string;
  size: number;
  uploadedAt: string;
};

function safeRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const normalized = value.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((part) =>
      part.length === 0 || part === "." || part === "..",
    )
  ) return null;

  const root = path.resolve(UPLOAD_ROOT);
  const resolved = path.resolve(root, ...normalized.split("/"));
  return resolved.startsWith(root + path.sep) ? normalized : null;
}

async function walk(dir: string, base: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

function isValidSidecar(value: unknown, expectedRelativePath: string): value is Sidecar {
  if (!value || typeof value !== "object") return false;
  const sidecar = value as Partial<Sidecar>;
  return (
    typeof sidecar.id === "string" &&
    /^[a-f0-9]{24}$/i.test(sidecar.id) &&
    sidecar.relativePath === expectedRelativePath &&
    sidecar.filename === path.posix.basename(expectedRelativePath) &&
    sidecar.url === `/uploads/${expectedRelativePath}` &&
    Number.isSafeInteger(sidecar.size) &&
    (sidecar.size ?? 0) > 0 &&
    typeof sidecar.uploadedAt === "string"
  );
}

async function main() {
  if (APPLY && process.env.HEAVIX_CONFIRM_MEDIA_SIDECAR_MIGRATION !== "1") {
    throw new Error(
      "Refusing --apply without HEAVIX_CONFIRM_MEDIA_SIDECAR_MIGRATION=1. Default mode is dry-run.",
    );
  }

  const files = await walk(UPLOAD_ROOT, UPLOAD_ROOT);
  const legacySidecars = files.filter((file) => file.endsWith(SUFFIX));
  let migrated = 0;
  let planned = 0;
  let alreadyPrivate = 0;
  let invalid = 0;
  let conflicts = 0;
  let errors = 0;

  for (const relativeSidecarPath of legacySidecars) {
    const assetRelativePath = relativeSidecarPath.slice(0, -SUFFIX.length);
    const safePath = safeRelativePath(assetRelativePath);
    if (!safePath) {
      invalid++;
      process.stderr.write(`SKIP invalid path: ${relativeSidecarPath}\n`);
      continue;
    }

    const source = path.join(UPLOAD_ROOT, ...relativeSidecarPath.split("/"));
    const target = path.join(PRIVATE_ROOT, ...safePath.split("/")) + SUFFIX;
    let raw: Buffer;
    let parsed: unknown;
    try {
      raw = await fs.readFile(source);
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      invalid++;
      process.stderr.write(`SKIP unreadable metadata: ${relativeSidecarPath}\n`);
      continue;
    }

    if (!isValidSidecar(parsed, safePath)) {
      invalid++;
      process.stderr.write(`SKIP invalid metadata contract: ${relativeSidecarPath}\n`);
      continue;
    }

    try {
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      let existing: Buffer | null = null;
      try {
        existing = await fs.readFile(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      if (existing) {
        if (!existing.equals(raw)) {
          conflicts++;
          process.stderr.write(`CONFLICT private metadata differs: ${relativeSidecarPath}\n`);
          continue;
        }
        alreadyPrivate++;
        if (APPLY) await fs.unlink(source);
        continue;
      }

      if (!APPLY) {
        process.stdout.write(`WOULD MOVE ${relativeSidecarPath} -> ${path.relative(ROOT, target)}\n`);
        planned++;
        continue;
      }

      try {
        await fs.copyFile(source, target, constants.COPYFILE_EXCL);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          conflicts++;
          process.stderr.write(`CONFLICT target created concurrently: ${relativeSidecarPath}\n`);
          continue;
        }
        throw error;
      }

      await fs.chmod(target, 0o600);
      const copied = await fs.readFile(target);
      if (!copied.equals(raw)) {
        await fs.unlink(target).catch(() => {});
        throw new Error(`Copied metadata verification failed: ${relativeSidecarPath}`);
      }

      await fs.unlink(source);
      migrated++;
    } catch (error) {
      errors++;
      process.stderr.write(
        `ERROR ${relativeSidecarPath}: ${error instanceof Error ? error.message : "unknown error"}\n`,
      );
    }
  }

  process.stdout.write(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    scanned: legacySidecars.length,
    migrated,
    planned,
    alreadyPrivate,
    invalid,
    conflicts,
    errors,
    productionAccessed: false,
  }, null, 2) + "\n");

  if (invalid > 0 || conflicts > 0 || errors > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "Migration failed") + "\n");
  process.exitCode = 1;
});
