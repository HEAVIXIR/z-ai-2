import { createHash, randomBytes } from "node:crypto";

export const COMPANY_INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function normalizeInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidInvitationEmail(value: string): boolean {
  return value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** 256 bits of entropy; only the SHA-256 digest is persisted. */
export function createCompanyInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isCompanyInvitationToken(value: unknown): value is string {
  return typeof value === "string" && INVITATION_TOKEN_PATTERN.test(value);
}

export function hashCompanyInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Stable per-company/email key; unique only while an invitation is pending. */
export function companyInvitationActiveKey(companyId: string, emailNormalized: string): string {
  return createHash("sha256")
    .update(companyId, "utf8")
    .update("\0")
    .update(emailNormalized, "utf8")
    .digest("hex");
}
