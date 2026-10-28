/**
 * Promote an existing, fully verified HEAVIX account to the canonical ADMIN role.
 *
 * Safety contract:
 * - Never creates an account or sets/resets a password.
 * - Requires an ACTIVE account with verified email and mobile.
 * - Requires explicit confirmation of email, DB host, DB name, and execute mode.
 * - Production promotion requires a second, repository-specific confirmation.
 * - Refuses to modify a different account or silently repair missing RBAC catalog.
 *
 * Usage (after a user has registered and verified email + mobile):
 *   HEAVIX_OWNER_PROMOTION_CONFIRM_EMAIL=owner@example.com \
 *   HEAVIX_OWNER_DB_HOST_CONFIRM=db.example.com \
 *   HEAVIX_OWNER_DB_NAME_CONFIRM=heavix \
 *   HEAVIX_OWNER_PROMOTION_EXECUTE=YES \
 *   bun run admin:promote-owner
 *
 * For production, also set:
 *   HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION=YES
 *   HEAVIX_OWNER_PROMOTION_CONFIRM_PRODUCTION=HEAVIXIR/z-ai-2:main:owner@example.com
 *
 * DATABASE_URL must be set through the operator's secure environment; it is never printed.
 */
import { PrismaClient } from "@prisma/client";

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

  const productionConfirmation = process.env.HEAVIX_OWNER_PROMOTION_CONFIRM_PRODUCTION;
  const isProductionTarget = process.env.NODE_ENV === "production" || Boolean(productionConfirmation);
  if (isProductionTarget) {
    if (process.env.HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION !== "YES") {
      throw new Error("Production target requires HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION=YES.");
    }
    if (productionConfirmation !== `HEAVIXIR/z-ai-2:main:${OWNER_EMAIL}`) {
      throw new Error("Production confirmation string does not match the repository and owner.");
    }
  }

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
