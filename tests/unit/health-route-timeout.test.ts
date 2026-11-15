import { beforeEach, describe, expect, it, vi } from "vitest";

const { appQueryRaw, storeQueryRaw } = vi.hoisted(() => ({
  appQueryRaw: vi.fn(),
  storeQueryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { $queryRaw: appQueryRaw } }));
vi.mock("@/lib/store-db", () => ({ storeDb: { $queryRaw: storeQueryRaw } }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health — bounded parallel database checks", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    appQueryRaw.mockResolvedValue(1);
    storeQueryRaw.mockResolvedValue(1);
  });

  it("returns healthy when App DB is up even if optional Store DB is down", async () => {
    storeQueryRaw.mockRejectedValue(new Error("store unavailable"));
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ db: "up", storeDb: "down" });
  });

  it("returns degraded when the primary App DB is unavailable", async () => {
    appQueryRaw.mockRejectedValue(new Error("app unavailable"));
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.db).toBe("down");
  });

  it("bounds both checks to eight seconds instead of hanging the health response", async () => {
    vi.useFakeTimers();
    appQueryRaw.mockImplementation(() => new Promise(() => undefined));
    storeQueryRaw.mockImplementation(() => new Promise(() => undefined));

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(8_000);
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks).toEqual({ db: "down", storeDb: "down" });
  });
});
