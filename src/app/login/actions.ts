"use server";

import { redirect } from "next/navigation";

/**
 * Logout remains a Server Action. Login is handled exclusively by the
 * rate-limited /api/auth/login endpoint; the legacy loginAction had no
 * explicit rate limit and weaker account-state checks.
 */
export async function logoutAction(): Promise<void> {
  const { destroyUserSession } = await import("@/lib/auth");
  await destroyUserSession();
  redirect("/login");
}
