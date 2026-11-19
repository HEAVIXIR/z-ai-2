import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * Moderation lifecycle contract.
 *
 * A wanted request must NOT be published immediately on creation. It is
 * created in a PENDING review state (status=PENDING, publishedAt=null)
 * and only becomes public + matchable after an admin approves it
 * (publishWanted → status=ACTIVE, publishedAt=now). This makes the
 * wizard's success-page promise ("published after expert review") true
 * and closes the P0 UX/logic contradiction flagged in #345.
 *
 * The public feed (status=ACTIVE filter), public detail (status!==ACTIVE
 * → 404), and matching eligibility (PENDING in rejection set) already
 * exclude PENDING rows — so no change is needed there. This contract
 * pins the create-side + admin-approval-side behavior.
 */
describe("WANTED moderation lifecycle contract", () => {
  const service = read("src/lib/wanted-service.ts");
  const adminBulk = read("src/app/api/admin/requests/route.ts");
  const adminSingle = read("src/app/api/admin/requests/[id]/route.ts");

  it("creates wanted requests in PENDING review state, not ACTIVE", () => {
    // The create path must set status=PENDING and publishedAt=null so the
    // request is invisible + un-matchable until admin approval.
    expect(service).toContain('const STATUS_PENDING = "PENDING"');
    expect(service).toContain("status: STATUS_PENDING");
    // publishedAt must be null at create time (not now()).
    expect(service).toContain("const publishedAt: Date | null = null");
  });

  it("does not publish at create time (no ACTIVE status, no publishedAt=now)", () => {
    // The create persist block must NOT use STATUS_PUBLISHED or new Date()
    // for publishedAt. (STATUS_PUBLISHED is reserved for the approval step.)
    const createBlock = service.split("// ── Persist ──")[1]?.split("// ── Audit")[0] ?? "";
    expect(createBlock).not.toContain("status: STATUS_PUBLISHED");
    expect(createBlock).not.toContain("publishedAt = new Date()");
  });

  it("exposes a publishWanted service function as the moderation gate", () => {
    expect(service).toContain("export async function publishWanted");
    expect(service).toContain("marketplace.wanted.publish");
    // publishWanted must flip status → ACTIVE and set publishedAt → now.
    expect(service).toContain("data: { status: STATUS_PUBLISHED, publishedAt }");
    // Idempotent: publishing an already-ACTIVE request is a no-op.
    expect(service).toContain("before.status === STATUS_PUBLISHED");
  });

  it("admin single-row PATCH supports action=approve via publishWanted", () => {
    expect(adminSingle).toContain('import { publishWanted');
    expect(adminSingle).toContain('body.action === "approve"');
    expect(adminSingle).toContain("await publishWanted(id, sessionUser.id)");
  });

  it("admin bulk POST supports action=approve (publishMany batched)", () => {
    expect(adminBulk).toContain('case "approve"');
    expect(adminBulk).toContain("marketplace.wanted.publishMany");
    expect(adminBulk).toContain('data: { status: "ACTIVE", publishedAt: approvedAt }');
  });

  it("the create audit records PENDING_REVIEW semantic status", () => {
    // The audit `after.status` is the semantic intent, schemaStatus is
    // what was actually written. For a moderation-gated create these
    // are "PENDING_REVIEW" and "PENDING" respectively.
    const auditSection = service.split("// ── Audit (best-effort) ──")[1] ?? "";
    expect(auditSection).toContain('status: "PENDING_REVIEW"');
    expect(auditSection).toContain("schemaStatus: request.status");
  });
});
