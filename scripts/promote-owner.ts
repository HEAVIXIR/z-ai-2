/**
 * Promote an existing, fully verified HEAVIX account to the canonical ADMIN role.
 *
 * Safety contract:
 * - Never creates an account or sets/resets a password.
 * - Requires an ACTIVE account with verified email and mobile.
 * - Requires explicit confirmation of email, DB host, DB name, target environment, and execute mode.
 * - Production promotion requires a separate allow flag and repository-specific confirmation.
 * - Refuses to modify a different account or silently repair missing RBAC catalog.
 *
 * Usage (after a user has registered and verified email + mobile):
 *   HEAVIX_OWNER_PROMOTION_CONFIRM_EMAIL=heavixir@gmail.com \
 *   HEAVIX_OWNER_DB_HOST_CONFIRM=db.example.com \
 *   HEAVIX_OWNER_DB_NAME_CONFIRM=heavix \
 *   HEAVIX_OWNER_TARGET_ENV_CONFIRM=non-production \
 *   bun run admin:promote-owner
 *
 * For production, set HEAVIX_OWNER_TARGET_ENV_CONFIRM=production and also:
 *   HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION=YES
 *   HEAVIX_OWNER_PROMOTION_CONFIRM_PRODUCTION=HEAVIXIR/z-ai-2:main:heavixir@gmail.com
 *
 * DATABASE_URL must be set through the operator's secure environment; it is never printed.
 */
import { PrismaClient } from '../src/lib/generated/client/client';
import { assertOwnerPromotionTargetEnvironment } from "./owner-promotion-environment";

const OWNER_EMAIL = "heavixir@gmail.com";
const db = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required safety variable: ${name}`);
  return value;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set; refusing to continue.");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is malformed; refusing to continue.");
  }

  const host = parsed.hostname;
  const databaseName = parsed.pathname.replace(/^\//, "").split("/")[0];
  if (!host || !databaseName) throw new Error("Could not determine DB host/name from DATABASE_URL.");

  const confirmedEmail = required("HEAVIX_OWNER_PROMOTION_CONFIRM_EMAIL").toLowerCase();
  const confirmedHost = required("HEAVIX_OWNER_DB_HOST_CONFIRM");
  const confirmedDb = required("HEAVIX_OWNER_DB_NAME_CONFIRM");
  if (confirmedEmail !== OWNER_EMAIL) throw new Error("Email confirmation does not match the configured owner.");
  if (confirmedHost !== host) throw new Error("DB host confirmation does not match DATABASE_URL.");
  if (confirmedDb !== databaseName) throw new Error("DB name confirmation does not match DATABASE_URL.");

  // Fail closed unless the operator explicitly attests to the DATABASE_URL target environment.
  assertOwnerPromotionTargetEnvironment(process.env);

  const user = await db.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: {
      id: true,
      email: true,
      status: true,
      emailVerified: true,
      mobileVerified: true,
      role: true,
    },
  });

  if (!user) {
    throw new Error(
      "Owner account does not exist. Register normally, verify email and mobile, then rerun this command. No account was created.",
    );
  }
  if (user.status !== "ACTIVE" || !user.emailVerified || !user.mobileVerified) {
    throw new Error(
      "Owner account must be ACTIVE with both email and mobile verified. No changes were made.",
    );
  }

  const adminRole = await db.role.findUnique({ where: { key: "ADMIN" }, select: { id: true } });
  if (!adminRole) {
    throw new Error("Canonical ADMIN role is missing. Run the reviewed RBAC seed process first; no changes were made.");
  }

  if (process.env.HEAVIX_OWNER_PROMOTION_EXECUTE !== "YES") {
    console.log(JSON.stringify({
      mode: "DRY_RUN",
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerified,
      mobileVerified: user.mobileVerified,
      currentLegacyRole: user.role,
      canonicalAdminRoleExists: true,
      action: "Would assign canonical ADMIN role and update legacy role to ADMIN.",
      note: "Set HEAVIX_OWNER_PROMOTION_EXECUTE=YES to apply after reviewing the exact DB target.",
    }, null, 2));
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      create: { userId: user.id, roleId: adminRole.id },
      update: {},
    });
    await tx.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
  });

  const verified = await db.userRole.findUnique({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    select: { id: true },
  });
  if (!verified) throw new Error("Post-write verification failed: ADMIN assignment not found.");

  console.log(JSON.stringify({
    mode: "APPLIED",
    email: user.email,
    canonicalAdminRoleAssigned: true,
    legacyRoleUpdated: true,
    passwordChanged: false,
    accountCreated: false,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Owner promotion failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
