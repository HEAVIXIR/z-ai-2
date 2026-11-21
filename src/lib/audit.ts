/**
 * HEAVIX — Audit log re-export (backward compat)
 * The canonical implementation is in src/lib/admin/audit.ts
 */
export { logAudit, logAuditStrict, audit, type LogAuditParams, type AuditActorType } from '@/lib/admin/audit';
