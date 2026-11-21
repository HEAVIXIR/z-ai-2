import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock the db client so publishWanted can be tested behaviorally without
// a real database connection. Each test configures the mock return values
// for findUnique/update and asserts the function's behavior (status
// transitions, 409 rejections, idempotency, repair).
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockLogAudit = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    buyRequest: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

// Import AFTER the mocks are registered.
const { publishWanted, bulkTransitionWanted, WantedServiceError } = await import("@/lib/wanted-service");

describe("publishWanted behavioral state machine", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockUpdateMany.mockReset();
    mockLogAudit.mockReset();
  });

  it("publishes a PENDING request → ACTIVE + publishedAt=now (CAS)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-1",
      status: "PENDING",
      title: "Test request",
      publishedAt: null,
      expiresAt: null,
    });
    // P0-C: publishWanted uses updateMany (CAS) — returns count=1 on success.
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await publishWanted("req-1", "admin-1");

    expect(result.status).toBe("ACTIVE");
    expect(result.id).toBe("req-1");
    expect(mockUpdateMany).toHaveBeenCalledOnce();
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
    expect(mockUpdateMany).not.toHaveBeenCalled();
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
    expect(mockUpdateMany).not.toHaveBeenCalled();
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
    expect(mockUpdateMany).not.toHaveBeenCalled();
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
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("repairs ACTIVE+null publishedAt via CAS (P0-6)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-6",
      status: "ACTIVE",
      title: "Active but null publishedAt",
      publishedAt: null,
      expiresAt: null,
    });
    // P0-C: the repair uses updateMany (CAS) — returns count=1 on success.
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await publishWanted("req-6", "admin-1");

    expect(result.status).toBe("ACTIVE");
    // The CAS updateMany must have been called (persist the repair, not fake it).
    expect(mockUpdateMany).toHaveBeenCalledOnce();
    // The audit must record the repair action.
    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.action).toBe("marketplace.wanted.publish.repair");
  });

  it("P0-C race: CAS returns 0 (concurrent transition) → re-read + 409", async () => {
    // Simulate a concurrent close between read and CAS write.
    mockFindUnique
      .mockResolvedValueOnce({
        id: "req-7",
        status: "PENDING",
        title: "Race request",
        publishedAt: null,
        expiresAt: null,
      })
      // The re-read after CAS-count=0 finds the row is now CLOSED.
      .mockResolvedValueOnce({
        id: "req-7",
        status: "CLOSED",
        publishedAt: null,
        expiresAt: null,
      });
    // CAS matched 0 rows (concurrent transition).
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(publishWanted("req-7", "admin-1")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("P0-C race: CAS returns 0 but re-read shows ACTIVE (idempotent)", async () => {
    // Another admin published it concurrently.
    const concurrentPublishedAt = new Date("2026-11-19T11:00:00Z");
    mockFindUnique
      .mockResolvedValueOnce({
        id: "req-8",
        status: "PENDING",
        title: "Race request",
        publishedAt: null,
        expiresAt: null,
      })
      .mockResolvedValueOnce({
        id: "req-8",
        status: "ACTIVE",
        publishedAt: concurrentPublishedAt,
        expiresAt: null,
      });
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await publishWanted("req-8", "admin-1");
    expect(result.status).toBe("ACTIVE");
    expect(result.publishedAt).toBe(concurrentPublishedAt.toISOString());
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

describe("bulkTransitionWanted behavioral state machine (P0-B/C/D)", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockUpdateMany.mockReset();
    mockLogAudit.mockReset();
  });

  it("P0-B: approves all-PENDING batch — approved=count, rejected=0", async () => {
    mockFindMany.mockResolvedValue([
      { id: "a", status: "PENDING", expiresAt: null },
      { id: "b", status: "PENDING", expiresAt: null },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 2 });

    const result = await bulkTransitionWanted("approve", ["a", "b"], "admin-1");

    expect(result.approved).toBe(2);
    expect(result.rejected).toEqual([]);
    expect(result.requested).toBe(2);
  });

  it("P0-B: mixed batch (PENDING + CLOSED + nonexistent) — accurate rejected list", async () => {
    // The eligible set is computed BEFORE the update, so the just-approved
    // PENDING row is NOT misclassified as rejected.
    mockFindMany.mockResolvedValue([
      { id: "p1", status: "PENDING", expiresAt: null },
      { id: "c1", status: "CLOSED", expiresAt: null },
      // "x1" is requested but nonexistent — NOT in findMany result.
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await bulkTransitionWanted("approve", ["p1", "c1", "x1"], "admin-1");

    expect(result.approved).toBe(1);
    expect(result.requested).toBe(3);
    // c1 (CLOSED) + x1 (nonexistent) are rejected.
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        { id: "c1", status: "CLOSED" },
        { id: "x1", status: "NOT_FOUND" },
      ]),
    );
    expect(result.rejected).toHaveLength(2);
    // p1 is NOT in rejected (it was approved).
    expect(result.rejected.find((r) => r.id === "p1")).toBeUndefined();
  });

  it("P0-B: deduplicates + caps at 100 ids", async () => {
    // Build 95 unique ids + 5 duplicates = 95 effective.
    const ids = Array.from({ length: 95 }, (_, i) => `id-${i}`);
    const dupes = ids.slice(0, 5);
    const all = [...ids, ...dupes];
    mockFindMany.mockResolvedValue(ids.map((id) => ({ id, status: "PENDING", expiresAt: null })));
    mockUpdateMany.mockResolvedValue({ count: 95 });

    const result = await bulkTransitionWanted("approve", all, "admin-1");
    expect(result.requested).toBe(95); // deduplicated
    expect(result.approved).toBe(95);
  });

  it("P0-B: rejects batch > 100 with 400", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    await expect(bulkTransitionWanted("approve", ids, "admin-1")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("P0-B: empty batch → approved=0, rejected=[]", async () => {
    const result = await bulkTransitionWanted("approve", [], "admin-1");
    expect(result.approved).toBe(0);
    expect(result.rejected).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("P0-D: close rejects FULFILLED (terminal)", async () => {
    mockFindMany.mockResolvedValue([{ id: "f1", status: "FULFILLED", expiresAt: null }]);
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await bulkTransitionWanted("close", ["f1"], "admin-1");
    expect(result.approved).toBe(0);
    expect(result.rejected).toEqual([{ id: "f1", status: "FULFILLED" }]);
  });

  it("P0-C: expired PENDING in approve batch is rejected, not approved", async () => {
    const past = new Date("2020-01-01T00:00:00Z");
    mockFindMany.mockResolvedValue([{ id: "e1", status: "PENDING", expiresAt: past }]);

    const result = await bulkTransitionWanted("approve", ["e1"], "admin-1");
    expect(result.approved).toBe(0);
    expect(result.rejected).toEqual([{ id: "e1", status: "PENDING" }]);
  });
});

describe("closeWantedByAdmin behavioral (P0-D1 — DELETE → soft-close)", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockUpdateMany.mockReset();
    mockLogAudit.mockReset();
  });

  it("P0-D1: closes an ACTIVE request via CAS (the DELETE path)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-del-1",
      status: "ACTIVE",
      title: "To be deleted",
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const { closeWantedByAdmin } = await import("@/lib/wanted-service");
    const result = await closeWantedByAdmin("req-del-1", "admin-1");

    expect(result.status).toBe("CLOSED");
    expect(mockUpdateMany).toHaveBeenCalledOnce();
    // No hard delete — the CAS updateMany is the only write.
    const auditCall = mockLogAudit.mock.calls[0][0];
    expect(auditCall.action).toBe("marketplace.wanted.close");
    expect(auditCall.actorType).toBe("ADMIN");
  });

  it("P0-D1: close is idempotent on already-CLOSED", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-del-2",
      status: "CLOSED",
      title: "Already closed",
    });

    const { closeWantedByAdmin } = await import("@/lib/wanted-service");
    const result = await closeWantedByAdmin("req-del-2", "admin-1");

    expect(result.status).toBe("CLOSED");
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("P0-D1: rejects FULFILLED (terminal — no re-close)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "req-del-3",
      status: "FULFILLED",
      title: "Fulfilled",
    });

    const { closeWantedByAdmin } = await import("@/lib/wanted-service");
    await expect(closeWantedByAdmin("req-del-3", "admin-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
