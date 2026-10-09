/**
 * HEAVIX — STEP 11.20 — readonlyWhen Bypass Prevention Tests
 *
 * Tests that the simultaneous-change bypass is closed:
 * - Persisted status=PUBLISHED + request { status: DRAFT, price: 100 }
 *   → price is STILL read-only (because persisted state is PUBLISHED)
 * - Omitting the controlling field → persisted value used
 * - Fabricating controlling value → persisted value used
 * - Condition NOT met → field is writable
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminResourceConfig } from "@/lib/admin/types";

vi.mock("@/lib/authorization", () => ({
  can: vi.fn(),
  canBulkAction: vi.fn(),
  canExport: vi.fn(),
}));

import { can } from "@/lib/authorization";
import { applyFieldWritePolicyAsync } from "@/lib/admin/field-policy";

const mockedCan = can as ReturnType<typeof vi.fn>;

const testConfig: AdminResourceConfig = {
  key: 'test-resource',
  titleFa: 'منبع تست',
  model: 'testModel',
  database: 'main',
  apiBase: '/api/admin/test',
  adminPath: '/admin/test',
  permissions: { read: 'test.read', create: 'test.manage', update: 'test.manage', delete: 'test.manage', export: 'test.read' },
  columns: [
    { key: 'name', label: 'نام', type: 'text' },
    { key: 'status', label: 'وضعیت', type: 'badge' },
    { key: 'price', label: 'قیمت', type: 'currency' },
  ],
  fields: [
    { key: 'name', label: 'نام', type: 'text', required: true },
    { key: 'status', label: 'وضعیت', type: 'select', required: true,
      options: [
        { value: 'DRAFT', label: 'پیش‌نویس' },
        { value: 'PUBLISHED', label: 'منتشرشده' },
      ] },
    // price is read-only when status=PUBLISHED (persisted state)
    { key: 'price', label: 'قیمت', type: 'currency',
      readonlyWhen: [{ field: 'status', operator: 'eq', value: 'PUBLISHED' }] },
  ],
  pageSize: 25,
};

beforeEach(() => {
  mockedCan.mockReset();
  mockedCan.mockResolvedValue(true); // user has all permissions
});

describe("STEP 11.20 — readonlyWhen bypass prevention", () => {
  it("SIMULTANEOUS CHANGE: persisted status=PUBLISHED + request { status: DRAFT, price: 100 } → price REJECTED", async () => {
    // This is THE test: user tries to change both the controlling field
    // (status: DRAFT) and the protected field (price: 100) in one request.
    // Before STEP 11.20: authoritativeState merged → status=DRAFT → condition
    // NOT met → price allowed → BYPASS.
    // After STEP 11.20: readonlyWhenState = persisted only → status=PUBLISHED
    // → condition MET → price REJECTED.
    const persistedRecord = { id: '1', name: 'Test', status: 'PUBLISHED', price: 50 };

    const result = await applyFieldWritePolicyAsync(
      testConfig,
      { status: 'DRAFT', price: 100 },
      { userId: 'user-1' },
      persistedRecord,
    );

    expect(result.ok).toBe(false);
    expect(result.rejectedField).toBe('price');
    expect(result.requiredPermission).toBe('FIELD_IS_READONLY');
  });

  it("OMIT controlling field: persisted status=PUBLISHED + request { price: 100 } → price REJECTED", async () => {
    const persistedRecord = { id: '1', name: 'Test', status: 'PUBLISHED', price: 50 };

    const result = await applyFieldWritePolicyAsync(
      testConfig,
      { price: 100 },
      { userId: 'user-1' },
      persistedRecord,
    );

    expect(result.ok).toBe(false);
    expect(result.rejectedField).toBe('price');
  });

  it("FABRICATE controlling value: persisted status=PUBLISHED + request { status: 'DRAFT', price: 100 } → still REJECTED (persisted used)", async () => {
    // Same as test 1 — explicitly documents that fabricated status is ignored
    const persistedRecord = { id: '1', name: 'Test', status: 'PUBLISHED', price: 50 };

    const result = await applyFieldWritePolicyAsync(
      testConfig,
      { status: 'DRAFT', price: 100 },
      { userId: 'user-1' },
      persistedRecord,
    );

    expect(result.ok).toBe(false);
    expect(result.rejectedField).toBe('price');
  });

  it("CONDITION NOT MET: persisted status=DRAFT + request { price: 100 } → price ALLOWED", async () => {
    const persistedRecord = { id: '1', name: 'Test', status: 'DRAFT', price: 50 };

    const result = await applyFieldWritePolicyAsync(
      testConfig,
      { price: 100 },
      { userId: 'user-1' },
      persistedRecord,
    );

    expect(result.ok).toBe(true);
    expect(result.filteredData!.price).toBe(100);
  });

  it("CHANGE controlling field ONLY: persisted status=PUBLISHED + request { status: DRAFT } → ALLOWED (no protected field)", async () => {
    // Changing the controlling field itself is fine — only the protected
    // field is locked when the condition is met in persisted state.
    const persistedRecord = { id: '1', name: 'Test', status: 'PUBLISHED', price: 50 };

    const result = await applyFieldWritePolicyAsync(
      testConfig,
      { status: 'DRAFT' },
      { userId: 'user-1' },
      persistedRecord,
    );

    expect(result.ok).toBe(true);
    expect(result.filteredData!.status).toBe('DRAFT');
  });

  it("CREATE (no persisted): submitted status=PUBLISHED + price=100 → price REJECTED", async () => {
    // For CREATEs, there's no persisted record — use submitted data.
    // If submitted status=PUBLISHED, price should be read-only.
    const result = await applyFieldWritePolicyAsync(
      testConfig,
      { name: 'New', status: 'PUBLISHED', price: 100 },
      { userId: 'user-1' },
      null, // no persisted record (CREATE)
    );

    expect(result.ok).toBe(false);
    expect(result.rejectedField).toBe('price');
  });

  it("CREATE (no persisted): submitted status=DRAFT + price=100 → price ALLOWED", async () => {
    const result = await applyFieldWritePolicyAsync(
      testConfig,
      { name: 'New', status: 'DRAFT', price: 100 },
      { userId: 'user-1' },
      null,
    );

    expect(result.ok).toBe(true);
    expect(result.filteredData!.price).toBe(100);
  });
});
