import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock the db client so publishWanted can be tested behaviorally without
// a real database connection. Each test configures the mock return values
// for findUnique/update and asserts the function's behavior (status
// transitions, 409 rejections, idempotency, repair).
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockLogAudit = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    buyRequest: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

// Import AFTER the mocks are registered.
const { publishWanted, WantedServiceError } = await import("@/lib/wanted-service");

describe("publishWanted behavioral state machine", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockLogAudit.mockReset();
  });

  it("publishes a PENDING request → ACTIVE + publishedAt=now", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-1",
      status: "PENDING",
      title: "Test request",
      publishedAt: null,
      expiresAt: null,
    });
    mockUpdate.mockResolvedValue({
      id: "req-1",
      status: "ACTIVE",
      publishedAt: new Date("2026-11-19T12:00:00Z"),
    });

    const result = await publishWanted("req-1", "admin-1");

    expect(result.status).toBe("ACTIVE");
    expect(result.id).toBe("req-1");
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockLogAudit).toHaveBeenCalledOnce();
    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.action).toBe("marketplace.wanted.publish");
    expect(auditCall.actorType).toBe("ADMIN");
  });

  it("rejects a CLOSED request with 409 (cannot re-publish)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-2",
      status: "CLOSED",
      title: "Closed request",
      publishedAt: new Date("2026-11-10T00:00:00Z"),
      expiresAt: null,
    });

    await expect(publishWanted("req-2", "admin-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a FULFILLED request with 409", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-3",
      status: "FULFILLED",
      title: "Fulfilled request",
      publishedAt: new Date("2026-11-10T00:00:00Z"),
      expiresAt: null,
    });

    await expect(publishWanted("req-3", "admin-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects an expired PENDING request with 409 (P0-5)", async () => {
    const past = new Date("2020-01-01T00:00:00Z");
    mockFindUnique.mockResolvedValue({
      id: "req-4",
      status: "PENDING",
      title: "Expired pending request",
      publishedAt: null,
      expiresAt: past,
    });

    await expect(publishWanted("req-4", "admin-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent on already-ACTIVE with a valid publishedAt (no update)", async () => {
    const publishedAt = new Date("2026-11-15T00:00:00Z");
    mockFindUnique.mockResolvedValue({
      id: "req-5",
      status: "ACTIVE",
      title: "Already active",
      publishedAt,
      expiresAt: null,
    });

    const result = await publishWanted("req-5", "admin-1");

    expect(result.status).toBe("ACTIVE");
    expect(result.publishedAt).toBe(publishedAt.toISOString());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("repairs ACTIVE+null publishedAt by persisting publishedAt=now (P0-6)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-6",
      status: "ACTIVE",
      title: "Active but null publishedAt",
      publishedAt: null,
      expiresAt: null,
    });
    const repairedAt = new Date("2026-11-19T12:00:00Z");
    mockUpdate.mockResolvedValue({
      id: "req-6",
      status: "ACTIVE",
      publishedAt: repairedAt,
    });

    const result = await publishWanted("req-6", "admin-1");

    expect(result.status).toBe("ACTIVE");
    // The update must have been called (persist the repair, not fake it).
    expect(mockUpdate).toHaveBeenCalledOnce();
    // The audit must record the repair action.
    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.action).toBe("marketplace.wanted.publish.repair");
  });

  it("throws 404 when the request does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(publishWanted("nonexistent", "admin-1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 400 when id is empty", async () => {
    await expect(publishWanted("", "admin-1")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 400 when adminUserId is empty", async () => {
    await expect(publishWanted("req-1", "")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("WantedServiceError carries the correct status code", () => {
    const err = new WantedServiceError(409, "test");
    expect(err.status).toBe(409);
    expect(err.message).toBe("test");
    expect(err.name).toBe("WantedServiceError");
  });
});
