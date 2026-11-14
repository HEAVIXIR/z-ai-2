import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_SECTIONS,
  mergeHomepageSections,
  type HomepageSectionConfig,
} from "@/lib/homepage/sections";

function row(overrides: Partial<HomepageSectionConfig> = {}): HomepageSectionConfig {
  return {
    id: "db-hero",
    key: "hero",
    title: "عنوان مدیریت‌شده",
    subtitle: null,
    description: null,
    order: 9,
    active: true,
    config: "{}",
    ...overrides,
  };
}

describe("canonical HEAVIX homepage composition", () => {
  it("defines all 17 canonical section keys exactly once", () => {
    const keys = DEFAULT_HOME_SECTIONS.map((section) => section.key);
    expect(keys).toHaveLength(17);
    expect(new Set(keys).size).toBe(17);
    expect(keys).toEqual([
      "hero",
      "categories",
      "hot-searches",
      "stats",
      "recommendations",
      "verified-machines",
      "featured-machines",
      "active-requests",
      "exclusive-sale",
      "services",
      "latest-ads",
      "sell7",
      "why-us",
      "trusted-brands",
      "brands",
      "knowledge",
      "cta",
    ]);
  });

  it("fills missing sections in memory and preserves the admin's existing configuration", () => {
    const existing = row({ order: 2, active: false, title: "عنوان سفارشی", config: '{"x":1}' });
    const result = mergeHomepageSections([existing]);

    expect(result).toHaveLength(17);
    expect(result.find((section) => section.key === "hero")).toMatchObject({
      id: "db-hero",
      title: "عنوان سفارشی",
      order: 2,
      active: false,
      config: '{"x":1}',
    });
    expect(result.find((section) => section.key === "brands")?.active).toBe(false);
    expect(result.map((section) => section.order)).toEqual(
      [...result].map((section) => section.order).sort((a, b) => a - b),
    );
  });

  it("provides the complete default composition when the configuration table is empty", () => {
    const result = mergeHomepageSections([]);
    expect(result.map((section) => section.key)).toEqual(
      DEFAULT_HOME_SECTIONS.map((section) => section.key),
    );
    expect(result.every((section) => section.id.startsWith("default-"))).toBe(true);
  });
});
