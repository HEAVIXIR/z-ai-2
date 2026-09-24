import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Require admin auth via RBAC (user session + ADMIN UserRole).
 * STEP 03: Legacy AdminSession cookie path REMOVED.
 * Returns true if admin, or a 401 NextResponse if not.
 */
export async function requireAdmin(): Promise<true | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = await isAdmin(user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
  }
  return true;
}

/** Helper to normalize a string field into a slug. */
export function slugify(s: string): string {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Generate a unique slug against a Prisma model. */
export async function uniqueSlug(
  model: { findUnique: (args: { where: { slug: string } }) => Promise<any> },
  base: string,
): Promise<string> {
  let slug = slugify(base) || `item-${Date.now()}`;
  let i = 1;
  while (await model.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${i++}`;
  }
  return slug;
}

/** Try to parse a BigInt-safe number from form/query input. */
export function parseBig(value: any): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const n = typeof value === "string" ? value.replace(/[^\d-]/g, "") : String(value);
    if (n === "" || n === "-") return null;
    return BigInt(n);
  } catch {
    return null;
  }
}

export function parseBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (!v) return false;
  return ["1", "true", "yes", "on", "TRUE", "True"].includes(String(v));
}

export function parseNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
