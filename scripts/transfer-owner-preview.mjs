/**
 * Controlled transfer of the pre-existing HEAVIX owner identity into App Preview.
 *
 * Safety contract:
 * - Preview-only: hard-pinned source and target PostgreSQL system identifiers.
 * - Source transaction is READ ONLY; target is read-only unless explicit APPLY mode.
 * - Never creates a new identity, resets a password, or prints/exports passwordHash.
 * - Preserves the existing User id, password hash, verification state, status and profile.
 * - Maps UserRole assignments by Role.key because Role ids differ between databases.
 * - Refuses schema drift, missing role mappings, FK dependencies, and any target collision.
 * - APPLY is additionally gated by a same-SHA successful paired encrypted backup workflow.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.PG_MODULE_PATH || "pg");

const OWNER_EMAIL = "heavixir@gmail.com";
const SOURCE_SYSTEM_ID = "7707373027511054367";
const TARGET_SYSTEM_ID = "7701427422680793119";
const EXPECTED_BRANCH = "integration/preview-readiness-workerd-2026-11-15";

const mode = process.env.TRANSFER_MODE ?? "DRY_RUN";
if (!["DRY_RUN", "APPLY"].includes(mode)) throw new Error("Invalid transfer mode.");
if (process.env.GITHUB_REF_NAME !== EXPECTED_BRANCH) throw new Error("Wrong branch; Preview transfer blocked.");
if (mode === "APPLY" && process.env.TRANSFER_CONFIRMATION !== "TRANSFER_EXISTING_OWNER_TO_PREVIEW_ONLY") {
  throw new Error("Exact APPLY confirmation missing; no changes made.");
}
if (mode === "DRY_RUN" && process.env.TRANSFER_CONFIRMATION) {
  throw new Error("Confirmation must be empty in DRY_RUN mode.");
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing protected environment secret: ${name}`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} is malformed.`); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error(`${name} must be a PostgreSQL URL.`);
  return value;
}

const sourceUrl = required("HEAVIX_OWNER_SOURCE_DATABASE_URL");
const targetUrl = required("MAIN_PREVIEW_DATABASE_URL");
if (sourceUrl === targetUrl) throw new Error("Source and target connection strings must be distinct.");

const userColumns = [
  "id", "firstName", "lastName", "email", "mobile", "passwordHash", "userType",
  "role", "status", "emailVerified", "mobileVerified", "companyName",
  "lastLoginAt", "verificationDeadline", "createdAt", "updatedAt",
  "companyId", "avgRating", "reviewCount",
];
const expectedUserColumns = new Set(userColumns);
const requiredRoleColumns = ["id", "key"];
const requiredUserRoleColumns = ["id", "userId", "roleId"];

function clientFor(connectionString, applicationName) {
  return new Client({
    connectionString,
    application_name: applicationName,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
    query_timeout: 35000,
    ssl: { rejectUnauthorized: true },
  });
}

async function systemIdentifier(client) {
  const result = await client.query("SELECT system_identifier::text AS id FROM pg_control_system()");
  return result.rows[0]?.id;
}

async function assertColumns(client, table, requiredColumns) {
  const result = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
    [table],
  );
  const actual = new Set(result.rows.map((row) => row.column_name));
  const missing = requiredColumns.filter((column) => !actual.has(column));
  if (missing.length) throw new Error(`Schema mismatch in ${table}; missing required columns: ${missing.join(", ")}.`);
}

let source;
let target;
let targetTransactionOpen = false;
try {
  source = clientFor(sourceUrl, "heavix-owner-preview-source-readonly");
  target = clientFor(targetUrl, "heavix-owner-preview-target-transfer");
  await source.connect();
  await target.connect();

  await source.query("BEGIN READ ONLY");
  const sourceSystem = await systemIdentifier(source);
  if (sourceSystem !== SOURCE_SYSTEM_ID) throw new Error("Source database identity mismatch; transfer blocked.");
  await assertColumns(source, "User", [...expectedUserColumns]);
  await assertColumns(source, "Role", requiredRoleColumns);
  await assertColumns(source, "UserRole", requiredUserRoleColumns);

  const sourceUsers = await source.query(
    `SELECT ${userColumns.map((column) => `"${column}"`).join(", ")}
       FROM "User" WHERE lower(email) = lower($1)`,
    [OWNER_EMAIL],
  );
  if (sourceUsers.rowCount !== 1) throw new Error("Source must contain exactly one allowlisted owner account.");
  const owner = sourceUsers.rows[0];
  if (owner.email !== OWNER_EMAIL || owner.status !== "ACTIVE" || owner.emailVerified !== true || owner.role !== "ADMIN") {
    throw new Error("Source owner identity is not in the expected ACTIVE, email-verified ADMIN state.");
  }
  if (owner.companyId !== null) throw new Error("Owner has a company relation; related records require a separate reviewed transfer.");
  if (!owner.passwordHash || typeof owner.passwordHash !== "string") throw new Error("Existing password hash is absent; transfer blocked.");

  const sourceAssignments = await source.query(
    `SELECT ur.id AS "userRoleId", r.key AS "roleKey"
       FROM "UserRole" ur
       JOIN "Role" r ON r.id = ur."roleId"
      WHERE ur."userId" = $1 ORDER BY r.key`,
    [owner.id],
  );
  if (!sourceAssignments.rows.some((row) => row.roleKey === "ADMIN")) {
    throw new Error("Source account has no canonical ADMIN UserRole assignment.");
  }
  if (sourceAssignments.rowCount < 1) throw new Error("Source owner has no role assignments.");

  await source.query("COMMIT");

  const targetSystem = await systemIdentifier(target);
  if (targetSystem !== TARGET_SYSTEM_ID) throw new Error("Target database identity mismatch; transfer blocked.");
  await assertColumns(target, "User", [...expectedUserColumns]);
  await assertColumns(target, "Role", requiredRoleColumns);
  await assertColumns(target, "UserRole", requiredUserRoleColumns);

  await target.query(mode === "APPLY" ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN READ ONLY");
  targetTransactionOpen = true;
  if (mode === "APPLY") {
    await target.query("SELECT pg_advisory_xact_lock(hashtext('heavix-owner-preview-transfer-v1'))");
  }

  const targetRolesResult = await target.query('SELECT id, key FROM "Role"');
  const targetRoles = new Map(targetRolesResult.rows.map((row) => [row.key, row.id]));
  for (const assignment of sourceAssignments.rows) {
    if (!targetRoles.has(assignment.roleKey)) {
      throw new Error(`Target is missing required role key: ${assignment.roleKey}; no changes made.`);
    }
  }

  const collisionSql = 'SELECT id, email FROM "User" WHERE id = $1 OR lower(email) = lower($2) OR ($3::text IS NOT NULL AND mobile = $3)' + (mode === "APPLY" ? " FOR UPDATE" : "");
  const collisions = await target.query(collisionSql, [owner.id, OWNER_EMAIL, owner.mobile]);
  if (collisions.rowCount !== 0) throw new Error("Target identity/email/mobile collision detected; transfer blocked.");

  const roleIdCollisions = await target.query(
    'SELECT id FROM "UserRole" WHERE id = ANY($1::text[])',
    [sourceAssignments.rows.map((row) => row.userRoleId)],
  );
  if (roleIdCollisions.rowCount !== 0) throw new Error("Target UserRole primary-key collision detected.");

  if (mode === "DRY_RUN") {
    await target.query("ROLLBACK");
    targetTransactionOpen = false;
    console.log(JSON.stringify({
      result: "DRY_RUN_PASS",
      mode,
      branch: EXPECTED_BRANCH,
      ownerEmail: OWNER_EMAIL,
      existingUserIdPreserved: true,
      passwordHashPreservedWithoutDisclosure: true,
      sourceSystemIdentifier: sourceSystem,
      targetSystemIdentifier: targetSystem,
      sourceStatus: owner.status,
      emailVerified: owner.emailVerified,
      mobileVerified: owner.mobileVerified,
      legacyRole: owner.role,
      roleKeysToPreserve: sourceAssignments.rows.map((row) => row.roleKey),
      targetIdentityCollision: false,
      schemaCompatibility: "PASS",
      noDatabaseWrites: true,
    }, null, 2));
  } else {
    const placeholders = userColumns.map((_, index) => `$${index + 1}`).join(", ");
    const insertUser = `INSERT INTO "User" (${userColumns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;
    await target.query(insertUser, userColumns.map((column) => owner[column]));

    for (const assignment of sourceAssignments.rows) {
      await target.query(
        'INSERT INTO "UserRole" ("id", "userId", "roleId") VALUES ($1, $2, $3)',
        [assignment.userRoleId, owner.id, targetRoles.get(assignment.roleKey)],
      );
    }

    const verifyUser = await target.query(
      'SELECT id, email, status, role, "emailVerified", "mobileVerified" FROM "User" WHERE id = $1 AND lower(email) = lower($2)',
      [owner.id, OWNER_EMAIL],
    );
    const verifyRoles = await target.query(
      'SELECT r.key FROM "UserRole" ur JOIN "Role" r ON r.id = ur."roleId" WHERE ur."userId" = $1 ORDER BY r.key',
      [owner.id],
    );
    const expectedKeys = sourceAssignments.rows.map((row) => row.roleKey).sort();
    const actualKeys = verifyRoles.rows.map((row) => row.key).sort();
    if (verifyUser.rowCount !== 1 || JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
      throw new Error("Post-insert verification failed; transaction will be rolled back.");
    }
    if (verifyUser.rows[0].status !== "ACTIVE" || verifyUser.rows[0].role !== "ADMIN" || verifyUser.rows[0].emailVerified !== true) {
      throw new Error("Post-insert owner-state verification failed; transaction will be rolled back.");
    }
    await target.query("COMMIT");
    targetTransactionOpen = false;
    console.log(JSON.stringify({
      result: "TRANSFER_APPLIED",
      mode,
      branch: EXPECTED_BRANCH,
      ownerEmail: OWNER_EMAIL,
      userIdPreserved: owner.id,
      passwordChanged: false,
      passwordHashPrinted: false,
      accountCreated: false,
      sourceSystemIdentifier: sourceSystem,
      targetSystemIdentifier: targetSystem,
      status: verifyUser.rows[0].status,
      emailVerified: verifyUser.rows[0].emailVerified,
      mobileVerified: verifyUser.rows[0].mobileVerified,
      legacyRole: verifyUser.rows[0].role,
      roleKeysVerified: actualKeys,
      transaction: "COMMITTED",
    }, null, 2));
  }
} catch (error) {
  if (target && targetTransactionOpen) {
    try { await target.query("ROLLBACK"); } catch {}
  }
  if (source) {
    try { await source.query("ROLLBACK"); } catch {}
  }
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  console.error(JSON.stringify({
    result: "TRANSFER_BLOCKED",
    reason: error instanceof Error ? error.message : "Unknown transfer error.",
    databaseErrorCode: code ?? null,
    noPartialCommit: true,
    sensitiveValuesPrinted: false,
  }));
  process.exitCode = 1;
} finally {
  if (source) await source.end().catch(() => {});
  if (target) await target.end().catch(() => {});
}
