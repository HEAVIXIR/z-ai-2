/**
 * HEAVIX - Phase 12 Seed Script
 *
 * Populates initial data for the Admin Control Plane:
 *   - System roles (super_admin, admin, moderator, member, guest)
 *   - Default feature flags
 *   - Default system settings
 *   - One super-admin user + sample users for the dashboard
 *   - A few sample audit log entries
 *
 * Usage:
 *   bun run scripts/seed.ts
 *
 * Idempotent: uses upserts; safe to re-run.
 */

import { PrismaClient, UserRole, UserStatus, SettingType } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

async function main() {
  // ---- 1. System roles ----------------------------------------------------
  log('Seeding system roles...');
  const roles = [
    { name: 'super_admin', description: 'Full system access, including destructive operations', color: '#dc2626', isSystem: true, permissions: ['*'] },
    { name: 'admin',       description: 'Manage users, roles, settings, and view audit logs',  color: '#ea580c', isSystem: true, permissions: ['users.read', 'users.write', 'roles.read', 'roles.write', 'settings.read', 'settings.write', 'flags.read', 'flags.write', 'audit.read'] },
    { name: 'moderator',   description: 'Manage content and moderate users',                   color: '#0891b2', isSystem: true, permissions: ['users.read', 'audit.read', 'flags.read'] },
    { name: 'member',       description: 'Standard authenticated user',                        color: '#16a34a', isSystem: true, permissions: ['profile.read', 'profile.write'] },
    { name: 'guest',        description: 'Unauthenticated or limited-access user',              color: '#6b7280', isSystem: true, permissions: [] },
  ];
  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      create: r,
      update: { description: r.description, color: r.color, permissions: r.permissions, isSystem: r.isSystem },
    });
  }
  log(`  ✓ ${roles.length} roles upserted`);

  // ---- 2. Default feature flags ------------------------------------------
  log('Seeding default feature flags...');
  const flags = [
    { key: 'new_dashboard_v2', name: 'New Dashboard v2', description: 'Next-gen admin dashboard with real-time updates', enabled: false, audience: 'admins' },
    { key: 'public_signup',    name: 'Public Sign-up',    description: 'Allow self-service account registration',           enabled: true,  audience: 'all' },
    { key: 'email_verification', name: 'Email Verification', description: 'Require email verification for new accounts',    enabled: true,  audience: 'all' },
    { key: 'dark_mode_default', name: 'Dark Mode by Default', description: 'Use dark theme for new visitors',                enabled: false, audience: 'all' },
    { key: 'maintenance_mode', name: 'Maintenance Mode', description: 'Block all non-admin access with a maintenance banner', enabled: false, audience: 'all' },
    { key: 'beta_features',    name: 'Beta Features',     description: 'Enable experimental beta features globally',         enabled: false, audience: 'internal' },
  ];
  for (const f of flags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      create: f,
      update: { name: f.name, description: f.description, audience: f.audience },
    });
  }
  log(`  ✓ ${flags.length} feature flags upserted`);

  // ---- 3. Default system settings ---------------------------------------
  log('Seeding default system settings...');
  const settings = [
    { key: 'site.name',          value: 'HEAVIX',                              type: SettingType.STRING, description: 'Public site name shown in titles and headers' },
    { key: 'site.tagline',       value: 'Admin Control Plane',                 type: SettingType.STRING, description: 'Short tagline under the site name' },
    { key: 'site.url',           value: 'http://localhost:3000',               type: SettingType.URL,    description: 'Canonical public URL of the site' },
    { key: 'email.from',         value: 'noreply@heavix.local',                type: SettingType.EMAIL,  description: 'From address for outgoing emails' },
    { key: 'limits.maxUploadMb', value: '50',                                  type: SettingType.NUMBER, description: 'Maximum file upload size in MB' },
    { key: 'limits.usersPerPage', value: '20',                                 type: SettingType.NUMBER, description: 'Default page size for user listing' },
    { key: 'security.sessionTimeoutMin', value: '60',                          type: SettingType.NUMBER, description: 'Admin session timeout in minutes' },
    { key: 'security.allowSignup', value: 'true',                              type: SettingType.BOOLEAN, description: 'Allow public self-signup' },
    { key: 'analytics.enabled',  value: 'true',                               type: SettingType.BOOLEAN, description: 'Collect usage analytics' },
    { key: 'theme.primaryColor', value: '#0f172a',                            type: SettingType.STRING, description: 'Primary brand color (hex)' },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      create: s,
      update: { value: s.value, type: s.type, description: s.description },
    });
  }
  log(`  ✓ ${settings.length} settings upserted`);

  // ---- 4. Users (super-admin + sample users) -----------------------------
  log('Seeding users...');
  const now = new Date();

  // Super admin
  await prisma.user.upsert({
    where: { email: 'admin@heavix.local' },
    create: {
      email: 'admin@heavix.local',
      name: 'HEAVIX Super Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      lastLoginAt: now,
      lastLoginIp: '127.0.0.1',
    },
    update: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE, name: 'HEAVIX Super Admin' },
  });

  // Sample users for the dashboard
  const sampleUsers = [
    { email: 'sarah.chen@heavix.local',    name: 'Sarah Chen',    role: UserRole.ADMIN,     status: UserStatus.ACTIVE,   days: 1 },
    { email: 'marco.silva@heavix.local',   name: 'Marco Silva',   role: UserRole.MODERATOR, status: UserStatus.ACTIVE,   days: 2 },
    { email: 'alex.kovacs@heavix.local',   name: 'Alex Kovács',   role: UserRole.ADMIN,     status: UserStatus.ACTIVE,   days: 5 },
    { email: 'priya.patel@heavix.local',   name: 'Priya Patel',   role: UserRole.MEMBER,    status: UserStatus.ACTIVE,   days: 7 },
    { email: 'tom.baker@heavix.local',     name: 'Tom Baker',     role: UserRole.MEMBER,    status: UserStatus.SUSPENDED, days: 12 },
    { email: 'yuki.tanaka@heavix.local',   name: 'Yuki Tanaka',   role: UserRole.MODERATOR, status: UserStatus.ACTIVE,   days: 15 },
    { email: 'nadia.ahmed@heavix.local',   name: 'Nadia Ahmed',   role: UserRole.MEMBER,    status: UserStatus.PENDING,  days: 18 },
    { email: 'carlos.mendez@heavix.local', name: 'Carlos Méndez', role: UserRole.MEMBER,    status: UserStatus.ACTIVE,   days: 22 },
    { email: 'emma.wilson@heavix.local',   name: 'Emma Wilson',   role: UserRole.MEMBER,    status: UserStatus.INVITED,  days: 28 },
    { email: 'liam.murphy@heavix.local',   name: 'Liam Murphy',   role: UserRole.GUEST,     status: UserStatus.PENDING,  days: 35 },
    { email: 'zoe.park@heavix.local',      name: 'Zoe Park',      role: UserRole.MEMBER,    status: UserStatus.ACTIVE,   days: 41 },
    { email: 'rafael.santos@heavix.local', name: 'Rafael Santos', role: UserRole.ADMIN,     status: UserStatus.ACTIVE,   days: 47 },
    { email: 'anna.kowalski@heavix.local', name: 'Anna Kowalski', role: UserRole.MEMBER,    status: UserStatus.SUSPENDED, days: 60 },
    { email: 'james.lee@heavix.local',     name: 'James Lee',     role: UserRole.MEMBER,    status: UserStatus.ACTIVE,   days: 75 },
    { email: 'leila.haddad@heavix.local',  name: 'Leila Haddad',  role: UserRole.MODERATOR, status: UserStatus.ACTIVE,   days: 90 },
  ];

  for (const u of sampleUsers) {
    const lastLogin = new Date(now.getTime() - u.days * 24 * 60 * 60 * 1000);
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        lastLoginAt: u.status === UserStatus.ACTIVE ? lastLogin : null,
        lastLoginIp: u.status === UserStatus.ACTIVE ? `10.0.${u.days % 255}.${u.days % 256}` : null,
      },
      update: { name: u.name, role: u.role, status: u.status },
    });
  }
  log(`  ✓ ${sampleUsers.length + 1} users upserted (1 super-admin + ${sampleUsers.length} sample)`);

  // ---- 5. Sample audit log entries --------------------------------------
  log('Seeding audit log entries...');
  const admin = await prisma.user.findUnique({ where: { email: 'admin@heavix.local' } });
  if (admin) {
    const auditEntries = [
      { action: 'user.create',     resource: 'User',        resourceId: 'sample-1', metadata: { email: 'priya.patel@heavix.local' }, status: 'success', minsAgo: 60 * 24 },
      { action: 'user.suspend',   resource: 'User',        resourceId: 'sample-2', metadata: { email: 'tom.baker@heavix.local', reason: 'policy violation' }, status: 'success', minsAgo: 60 * 26 },
      { action: 'feature_flag.toggle', resource: 'FeatureFlag', resourceId: 'new_dashboard_v2', metadata: { from: false, to: false }, status: 'success', minsAgo: 60 * 30 },
      { action: 'setting.update',  resource: 'SystemSetting', resourceId: 'site.name', metadata: { from: 'Old Name', to: 'HEAVIX' }, status: 'success', minsAgo: 60 * 48 },
      { action: 'role.create',     resource: 'Role',        resourceId: 'sample-role', metadata: { name: 'editor' }, status: 'failure', minsAgo: 60 * 50 },
      { action: 'user.invite',     resource: 'User',        resourceId: 'sample-3', metadata: { email: 'emma.wilson@heavix.local' }, status: 'success', minsAgo: 60 * 72 },
      { action: 'session.revoke',  resource: 'AdminSession', resourceId: 'sess-1', metadata: { reason: 'manual revoke' }, status: 'success', minsAgo: 60 * 96 },
      { action: 'login.success',   resource: 'User',        resourceId: admin.id, metadata: {}, status: 'success', minsAgo: 5 },
    ];
    for (const entry of auditEntries) {
      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          actorEmail: admin.email,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          metadata: entry.metadata,
          ip: '127.0.0.1',
          userAgent: 'HEAVIX-Admin/1.0',
          status: entry.status,
          createdAt: new Date(now.getTime() - entry.minsAgo * 60 * 1000),
        },
      });
    }
    log(`  ✓ ${auditEntries.length} audit log entries created`);
  }

  // ---- 6. System metrics (for the dashboard charts) ---------------------
  log('Seeding system metrics (last 24h, hourly)...');
  const metrics: { metric: string; value: number; unit: string; minsAgo: number }[] = [];
  for (let h = 24; h >= 0; h--) {
    const minsAgo = h * 60;
    metrics.push({ metric: 'requests.per_min',  value: 50 + Math.round(Math.sin(h / 3) * 30 + Math.random() * 20), unit: 'req/min', minsAgo });
    metrics.push({ metric: 'users.active',       value: 5 + Math.round(Math.cos(h / 4) * 4 + Math.random() * 3 + 5), unit: 'users',  minsAgo });
    metrics.push({ metric: 'db.connections',    value: 8 + Math.round(Math.sin(h / 2) * 3 + Math.random() * 2 + 3), unit: 'conns',  minsAgo });
    metrics.push({ metric: 'response.time_ms',  value: 120 + Math.round(Math.sin(h / 5) * 40 + Math.random() * 30), unit: 'ms',     minsAgo });
  }
  for (const m of metrics) {
    await prisma.systemMetric.create({
      data: {
        metric: m.metric,
        value: m.value,
        unit: m.unit,
        createdAt: new Date(now.getTime() - m.minsAgo * 60 * 1000),
      },
    });
  }
  log(`  ✓ ${metrics.length} metric data points created`);

  log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('[seed] FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
