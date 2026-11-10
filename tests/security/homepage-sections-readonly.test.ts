import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { DEFAULT_HOME_SECTIONS } from "@/lib/homepage/sections";

const { findMany, createMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    homePageSection: {
      findMany,
      createMany,
    },
  },
}));

import { GET } from "@/app/api/homepage-sections/route";

describe("GET /api/homepage-sections — public read-only contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active sections in the database-provided order", async () => {
    findMany.mockResolvedValue([
      {
        key: "hero",
        title: "Hero",
        subtitle: null,
        description: null,
        order: 1,
        active: true,
        config: '{"variant":"dark"}',
      },
    ]);

    const response = await GET();
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [{ key: "hero", order: 1, config: { variant: "dark" } }],
    });
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { order: "asc" },
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("returns an empty collection without seeding when no rows exist", async () => {
    findMany.mockResolvedValue([]);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.map((section: { key: string }) => section.key)).toEqual(
      DEFAULT_HOME_SECTIONS.filter((section) => section.active).map((section) => section.key),
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it("does not re-enable a section explicitly disabled by the admin", async () => {
    findMany.mockResolvedValue([
      {
        key: "hero",
        title: "Hero",
        subtitle: null,
        description: null,
        order: 1,
        active: false,
        config: "{}",
        id: "db-hero",
      },
    ]);

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.some((section: { key: string }) => section.key === "hero")).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("does not expose database errors and returns a safe unavailable response", async () => {
    findMany.mockRejectedValue(new Error("sensitive database connection detail"));

    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({
      success: false,
      data: [],
      error: "Homepage sections are temporarily unavailable",
    });
    expect(JSON.stringify(body)).not.toContain("sensitive database connection detail");
    expect(createMany).not.toHaveBeenCalled();
  });
});
