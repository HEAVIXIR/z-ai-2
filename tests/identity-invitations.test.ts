import { describe, expect, it } from "vitest";
import {
  companyInvitationActiveKey,
  createCompanyInvitationToken,
  hashCompanyInvitationToken,
  isCompanyInvitationToken,
  isValidInvitationEmail,
  normalizeInvitationEmail,
} from "../src/lib/identity/invitations";

describe("company invitation token contract", () => {
  it("creates high-entropy URL-safe tokens and stores only a digest", () => {
    const first = createCompanyInvitationToken();
    const second = createCompanyInvitationToken();

    expect(isCompanyInvitationToken(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(hashCompanyInvitationToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCompanyInvitationToken(first)).not.toBe(first);
  });

  it("rejects malformed tokens", () => {
    expect(isCompanyInvitationToken("")).toBe(false);
    expect(isCompanyInvitationToken("short-token")).toBe(false);
    expect(isCompanyInvitationToken("x".repeat(43) + "!")).toBe(false);
  });

  it("normalizes and validates email addresses", () => {
    expect(normalizeInvitationEmail("  Sales@Example.COM ")).toBe("sales@example.com");
    expect(isValidInvitationEmail("sales@example.com")).toBe(true);
    expect(isValidInvitationEmail("not-an-email")).toBe(false);
    expect(isValidInvitationEmail("x".repeat(250) + "@example.com")).toBe(false);
  });

  it("creates a deterministic active key scoped to company and normalized email", () => {
    const key = companyInvitationActiveKey("company-a", "sales@example.com");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).toBe(companyInvitationActiveKey("company-a", "sales@example.com"));
    expect(key).not.toBe(companyInvitationActiveKey("company-b", "sales@example.com"));
    expect(key).not.toBe(companyInvitationActiveKey("company-a", "other@example.com"));
  });
});
