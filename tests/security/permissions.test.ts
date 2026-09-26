/**
 * HEAVIX — Security Permissions Matrix Tests (Track E / T4)
 * ------------------------------------------------------------
 * Verifies the canonical permission keys referenced by the
 * admin resource registry and the marketplace CP modules are
 * present in the central `PERMISSIONS` array exported from
 * `src/lib/authorization/permissions.ts`.
 *
 * Why this matters: at runtime, `can(user, "foo.bar")` returns
 * false silently when `"foo.bar"` is not in the matrix — there
 * is no compile-time guard against typos / drift. A missing
 * key manifests as a 403 for every role (including ADMIN) on
 * the affected route. This test is the regression net for the
 * STEP 16-C "missing permission constant" class of bug.
 *
 * Runs under `bun run test:security`
 * (config: vitest.security.config.ts → includes tests/security/**).
 */

import { describe, it, expect } from "vitest";
import { PERMISSIONS } from "../../src/lib/authorization/permissions";

describe("Permission matrix — canonical keys are present", () => {
  // Sample of high-leverage permission keys that MUST be in the
  // array because admin resource routes & marketplace CP code
  // reference them by literal string. A missing key here would
  // silently degrade to 403 for every role including ADMIN.
  const requiredKeys: string[] = [
    // Core admin / user / company
    "admin.dashboard.read",
    "user.read",
    "user.create",
    "user.update",
    "user.delete",
    "company.read",
    "company.verify",

    // Marketplace listings / catalog
    "listing.read",
    "listing.create",
    "listing.publish",
    "listing.moderate",
    "product.read",
    "brand.read",
    "brand.publish",
    "category.read",

    // Orders / payments / deals / reviews
    "order.read",
    "payment.read",
    "payment.refund",
    "deal.read",
    "deal.manage",
    "review.read",
    "review.moderate",

    // STEP 16-C additions (previously missing — caused admin 403s)
    "part.read",
    "part.update",
    "machine.read",
    "offer.read",
    "offer.update",
    "inspection.read",
    "inspection.manage",
    "transport.read",
    "transport.manage",
    "request.read",
    "request.manage",
    "dispute.read",
    "dispute.manage",

    // Marketplace CP additions (Track B)
    "conversation.read",
    "moderation.read",
    "moderation.moderate",
    "matching.read",

    // Price intelligence
    "price.read",
    "price.override",
  ];

  it("the PERMISSIONS array is non-empty", () => {
    expect(Array.isArray(PERMISSIONS)).toBe(true);
    expect(PERMISSIONS.length).toBeGreaterThan(0);
  });

  it.each(requiredKeys)("PERMISSIONS contains %s", (key) => {
    expect(PERMISSIONS).toContain(key);
  });

  it("every permission key follows the dotted resource.action convention", () => {
    // Permission keys are dot-separated lowercase identifiers with at
    // least two segments (e.g. `user.read`, `admin.dashboard.read`).
    for (const key of PERMISSIONS) {
      expect(
        typeof key === "string" && /^[a-z_]+(\.[a-z_]+)+$/i.test(key),
        `permission key "${key}" does not match the dotted resource.action pattern`,
      ).toBe(true);
    }
  });
});
