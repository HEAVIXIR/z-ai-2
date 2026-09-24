/**
 * HEAVIX STEP 02 — Permission Matrix Seed
 *
 * Seeds ALL resource/action-oriented permissions (65+) and
 * assigns them to roles based on the V2.1 matrix.
 *
 * Idempotent: uses upsert. Safe to re-run.
 *
 * Usage: bunx tsx prisma/seed-permission-matrix.ts
 */

import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/lib/authorization/permissions';

const prisma = new PrismaClient();

async function main() {
  console.log('→ Seeding Permission Matrix (V2.1) …');

  // ── 1. Upsert all permissions ──────────────────────────
  console.log(`  Adding ${PERMISSIONS.length} permissions…`);

  // Parse resource/action from key (e.g., "listing.publish" → resource="listing")
  for (const key of PERMISSIONS) {
    const [resource, action] = key.split('.');
    await prisma.permission.upsert({
      where: { key },
      create: {
        key,
        nameFa: `${action} ${resource}`,
        nameEn: `${action} ${resource}`,
        description: `${action} permission for ${resource}`,
        resource,
      },
      update: {
        resource, // ensure resource field is set for existing permissions
      },
    });
  }

  // Also keep legacy permissions that aren't in the new matrix
  // (they're already in the DB from seed-rbac.ts and might be referenced by old code)
  console.log('  Preserving legacy permissions…');

  // ── 2. Assign permissions to roles ──────────────────────
  for (const [roleKey, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      console.warn(`  ⚠ Role "${roleKey}" not found — skipping`);
      continue;
    }

    for (const permKey of perms) {
      const perm = await prisma.permission.findUnique({ where: { key: permKey } });
      if (!perm) {
        console.warn(`  ⚠ Permission "${permKey}" not found — skipping`);
        continue;
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        create: {
          roleId: role.id,
          permissionId: perm.id,
        },
        update: {},
      });
    }

    console.log(`  ✓ ${roleKey}: ${perms.length} permissions`);
  }

  // ── 3. Stats ────────────────────────────────────────────
  const permCount = await prisma.permission.count();
  const rpCount = await prisma.rolePermission.count();
  const roleCount = await prisma.role.count();

  console.log('');
  console.log('═════════════════════════════════════════════');
  console.log('Permission Matrix Seed Complete');
  console.log(`  Roles:       ${roleCount}`);
  console.log(`  Permissions: ${permCount}`);
  console.log(`  Assignments: ${rpCount}`);
  console.log('═════════════════════════════════════════════');
}

main()
  .catch(err => { console.error('[seed] FATAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
