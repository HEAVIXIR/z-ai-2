/**
 * HEAVIX — STEP 11.38: Shared admin-authorization helper.
 *
 * Replaces the scattered `if (!(await isAuthenticated()))` pattern
 * (which grants access to ANY logged-in user, including BUYERs) with
 * a proper RBAC permission check.
 *
 * Usage:
 *   import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
 *
 *   export async function POST(req: Request) {
 *     const auth = await requireAdminPermission("taxonomy.write");
 *     if (auth.error) return auth.error;
 *     // ... handler body ...
 *   }
 *
 * Returns:
 *   - { user } on success (authenticated + has permission)
 *   - { error: NextResponse(401) } if anonymous
 *   - { error: NextResponse(403) } if authenticated but lacking permission
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authorization";

export async function requireAdminPermission(permission: string): Promise<
  | { user: { id: string }; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const hasPermission = await can(user.id, permission);
  if (!hasPermission) {
    return {
      user: null,
      error: NextResponse.json(
        { error: `Forbidden: requires '${permission}'` },
        { status: 403 },
      ),
    };
  }
  return { user, error: null };
}
