import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { trackError } from "@/lib/error-tracking";
import { buildBackupEnvironment } from "@/lib/backup-config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);
const BACKUP_ID = /^\d{8}_\d{6}$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only paired PostgreSQL backup.
 * Both Main and Store dumps must exist, be non-empty, and pass checksums
 * before the API reports success. HTTP responses never expose paths,
 * command output, connection URLs, or raw process errors.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Permission denial must happen before any filesystem/process side effect.
  await requirePermission(user.id, "backup.manage");

  try {
    const projectRoot = path.resolve(process.cwd());
    const scriptPath = path.join(projectRoot, "scripts", "backup.sh");
    await fs.access(scriptPath);

    const backupEnv = buildBackupEnvironment(process.env);
    const { stdout } = await execFileAsync("bash", [scriptPath], {
      cwd: projectRoot,
      env: { ...process.env, ...backupEnv, BACKUP_ROOT: "./backups", BACKUP_DOCKER_MODE: "0" },
      maxBuffer: 64 * 1024,
      timeout: 240_000,
    });

    const match = stdout.match(/Backup complete:\s+\.\/backups\/(\d{8}_\d{6})/);
    const backupId = match?.[1];
    if (!backupId || !BACKUP_ID.test(backupId)) {
      throw new Error("Backup script did not return the expected completion marker");
    }

    const backupDir = path.join(projectRoot, "backups", backupId);
    for (const filename of ["main.sql", "store.sql", "checksums.txt"]) {
      const info = await fs.stat(path.join(backupDir, filename));
      if (!info.isFile() || info.size <= 0) {
        throw new Error("Backup output validation failed");
      }
    }
    await execFileAsync("sha256sum", ["-c", "checksums.txt"], {
      cwd: backupDir,
      maxBuffer: 16 * 1024,
      timeout: 10_000,
    });

    await logAudit({
      actorType: "ADMIN",
      action: "backup.create",
      entityType: "Database",
      reason: "Manual paired PostgreSQL backup (Main + Store)",
    });

    return NextResponse.json({
      ok: true,
      backupId,
      databases: ["main", "store"],
    });
  } catch (err: unknown) {
    trackError(err, { endpoint: "POST /api/admin/backup" });
    return NextResponse.json(
      { error: "Backup failed; no successful paired backup was confirmed." },
      { status: 500 },
    );
  }
}
