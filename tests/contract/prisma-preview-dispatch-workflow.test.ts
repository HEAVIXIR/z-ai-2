import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.join(process.cwd(), ".github/workflows/prisma-preview-workerd-proof.yml"),
  "utf8",
);
const worker = readFileSync(
  path.join(process.cwd(), "tests/workerd/worker.ts"),
  "utf8",
);
const runner = readFileSync(
  path.join(process.cwd(), "scripts/run-prisma-workerd-proof.mjs"),
  "utf8",
);

describe("Prisma Preview Workerd dispatch safety contract", () => {
  it("requires explicit PREVIEW_ONLY dispatch confirmation", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("confirm_preview_only:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("PREVIEW_ONLY");
  });

  it("checks out and verifies the exact triggering commit, not a historical SHA", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
    expect(workflow).not.toContain("b94b9d6f3540e8f4467b1d4ac051d5ef050c0994");
  });

  it("runs inside the protected Preview proof environment", () => {
    expect(workflow).toContain("environment: preview-proof");
  });

  it("requires both distinct Preview secrets without printing their values", () => {
    expect(workflow).toContain("HEAVIX_APP_PREVIEW_PPG_URL");
    expect(workflow).toContain("HEAVIX_STORE_PREVIEW_PPG_URL");
    expect(workflow).toContain('test -n "$HEAVIX_APP_PREVIEW_PPG_URL"');
    expect(workflow).toContain('test -n "$HEAVIX_STORE_PREVIEW_PPG_URL"');
    expect(workflow).toContain('test "$HEAVIX_APP_PREVIEW_PPG_URL" != "$HEAVIX_STORE_PREVIEW_PPG_URL"');
    expect(workflow).not.toMatch(/echo .*HEAVIX_(APP|STORE)_PREVIEW_PPG_URL/);
  });

  it("proves least privilege beyond the transaction_read_only session flag", () => {
    expect(worker).toContain("rolsuper AS is_superuser");
    expect(worker).toContain("rolreplication AS can_replicate");
    expect(worker).toContain("default_transaction_read_only=on");
    expect(worker).toContain("!row.default_transaction_read_only_on");
    expect(worker).toContain("pg_has_role(current_user, 'pg_write_all_data', 'MEMBER')");
    expect(worker).toContain("pg_has_role(current_user, 'pg_write_all_data', 'USAGE')");
    expect(worker).toContain("pg_has_role(current_user, 'pg_read_server_files', 'MEMBER')");
    expect(worker).toContain("row.member_pg_read_server_files");
    expect(worker).toContain("has_table_privilege(current_user, c.oid, 'INSERT')");
    expect(worker).toContain("has_sequence_privilege(current_user, c.oid, 'UPDATE')");
    expect(worker).toContain("p.prosecdef");
    expect(worker).toContain("has_function_privilege(current_user, p.oid, 'EXECUTE')");
    expect(worker).toContain("row.can_execute_security_definer_function");
    expect(worker).toContain("has_schema_privilege(current_user, n.oid, 'CREATE')");
    expect(worker).toContain("has_database_privilege(current_user, current_database(), 'CREATE')");
    expect(worker).toContain("readOnlyProven: readOnlyProven && roleEvidence.proven");
    expect(runner).toContain("readOnlyRoleEvidence?.proven");
    expect(runner).toContain("least-privilege role attributes, memberships, and effective table/sequence/schema/database privileges");
  });

  it("runs only the local Workerd proof and has no deployment or migration command", () => {
    expect(workflow).toContain("bun run test:workerd");
    expect(workflow).not.toMatch(/wrangler\s+deploy/i);
    expect(workflow).not.toMatch(/prisma\s+migrate|prisma\s+db\s+push/i);
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
  });
});
