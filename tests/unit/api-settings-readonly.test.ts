import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, create } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    siteSettings: {
      findUnique,
      create,
    },
  },
}));

import { GET } from "@/app/api/settings/route";

describe("GET /api/settings", () => {
  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
  });

  it("returns safe defaults without creating a missing settings row", async () => {
    findUnique.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "main" } });
    expect(create).not.toHaveBeenCalled();
    expect(body.settings).toMatchObject({
      about: null,
      phone: null,
      email: null,
      address: null,
      workingHours: null,
      copyright: null,
      newsletterEnabled: false,
      showPersianName: false,
      logoAnimationDurationMs: 10000,
    });
  });

  it("returns only approved public settings fields", async () => {
    findUnique.mockResolvedValue({
      id: "main",
      about: "About",
      phone: "02100000000",
      email: "hello@example.invalid",
      address: "Address",
      workingHours: "Hours",
      copyright: "Copyright",
      newsletterEnabled: true,
      logoUrl: "/logo.svg",
      footerLogoUrl: "/footer.svg",
      logoText: "HEAVIX",
      logoHeight: 48,
      footerLogoHeight: null,
      showPersianName: true,
      logoPosition: "right",
      footerLogoPosition: "left",
      footerHeavixLogoUrl: null,
      footerMekanixLogoUrl: null,
      footerAriaLogoUrl: null,
      logoAnimationDurationMs: 8000,
      privateInternalField: "must-not-leak",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings.about).toBe("About");
    expect(body.settings.logoAnimationDurationMs).toBe(8000);
    expect(body.settings).not.toHaveProperty("id");
    expect(body.settings).not.toHaveProperty("privateInternalField");
    expect(create).not.toHaveBeenCalled();
  });
});
