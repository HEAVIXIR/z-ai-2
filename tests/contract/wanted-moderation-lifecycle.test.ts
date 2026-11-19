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
    // P0-C: publishWanted uses compare-and-set (updateMany with status
    // condition), not a blind update. The CAS data sets status + publishedAt.
    expect(service).toContain("data: { status: targetStatus, publishedAt }");
  });

  it("publishWanted enforces a state machine — only PENDING can be approved", () => {
    // Terminal states (CLOSED/FULFILLED/REJECTED/EXPIRED) are rejected
    // with 409 — they cannot be re-published. The state machine is a
    // single canonical transition matrix.
    expect(service).toContain('TERMINAL_STATUSES = new Set([');
    expect(service).toContain("ALLOWED_TRANSITIONS");
    expect(service).toContain("resolveTransitionTarget");
    // The only valid approve transition is PENDING → ACTIVE.
    expect(service).toContain('approve: STATUS_PUBLISHED');
  });

  it("publishWanted rejects expired requests in the moderation queue (P0-5)", () => {
    expect(service).toContain("before.expiresAt instanceof Date");
    expect(service).toContain("before.expiresAt.getTime() <= now.getTime()");
    expect(service).toContain("منقضی شده است و قابل انتشار نیست");
  });

  it("publishWanted repairs ACTIVE+null publishedAt via CAS (P0-6)", () => {
    expect(service).toContain("marketplace.wanted.publish.repair");
    // P0-C: the repair uses CAS (updateMany with status=ACTIVE + publishedAt=null).
    expect(service).toContain("where: { id, status: STATUS_PUBLISHED, publishedAt: null }");
  });

  it("admin single-row PATCH redirects legacy activate to the controlled publishWanted gate", () => {
    expect(adminSingle).toContain('body.action === "approve" || body.action === "activate"');
    expect(adminSingle).toContain("await publishWanted(id, sessionUser.id)");
  });

  it("admin single-row PATCH does NOT allow free-form status editing (P0-2)", () => {
    // status must be absent from the allowed list — transitions happen
    // only via the action buttons (approve/close/fulfill).
    const allowedSection = adminSingle.split("const allowed = [")[1]?.split("]")[0] ?? "";
    expect(allowedSection).not.toContain('"status"');
  });

  it("admin bulk POST has CSRF protection (P0-1)", () => {
    expect(adminBulk).toContain("import { checkCsrf }");
    expect(adminBulk).toContain("if (!checkCsrf(req))");
    expect(adminBulk).toContain('CSRF check failed');
  });

  it("admin bulk approve delegates to bulkTransitionWanted (P0-B/C/D)", () => {
    expect(adminBulk).toContain('import { bulkTransitionWanted');
    expect(adminBulk).toContain('await bulkTransitionWanted(');
    // P0-B: the response reports approved + rejected + rejectedIds.
    expect(adminBulk).toContain("approved: result.approved");
    expect(adminBulk).toContain("rejected: result.rejected.length");
    expect(adminBulk).toContain("rejectedIds: result.rejected");
    expect(adminBulk).toContain("requested: result.requested");
  });

  it("admin bulk also routes close/fulfill through the state machine (P0-D)", () => {
    expect(adminBulk).toContain('case "close"');
    expect(adminBulk).toContain('case "fulfill"');
    // The three approve/close/fulfill cases share one block that delegates
    // to bulkTransitionWanted with the resolved action.
    expect(adminBulk).toContain("bulkTransitionWanted(");
    expect(adminBulk).toContain('action as "approve" | "close" | "fulfill"');
  });

  it("the create audit records PENDING_REVIEW semantic status", () => {
    // The audit `after.status` is the semantic intent, schemaStatus is
    // what was actually written. For a moderation-gated create these
    // are "PENDING_REVIEW" and "PENDING" respectively.
    const auditSection = service.split("// ── Audit (best-effort) ──")[1] ?? "";
    expect(auditSection).toContain('status: "PENDING_REVIEW"');
    expect(auditSection).toContain("schemaStatus: request.status");
  });

  it("the real /admin/requests page exposes PENDING in filters + approve button (P0-7)", () => {
    const page = read("src/app/admin/requests/page.tsx");
    expect(page).toContain("PENDING");
    expect(page).toContain("STATUS_CFG");
    expect(page).toContain("Rocket");
    expect(page).toContain('action(r.id, "approve")');
    // Status transitions must NOT be in the edit-modal save payload.
    const saveSection = page.split("const save = async")[1]?.split("},")[0] ?? "";
    expect(saveSection).not.toContain("status: form.status");
  });

  it("/api/wanted requires intent (P1-10) and handles date-only deadlines (P1-9)", () => {
    const route = read("src/app/api/wanted/route.ts");
    // P1-10: intent is required on the canonical endpoint.
    expect(route).toContain("intentStr");
    expect(route).toContain("نوع تقاضا (intent) الزامی است");
    // P1-9: date-only deadlines get end-of-day appended.
    expect(route).toContain("T23:59:59");
  });
});
