import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import FavoritesClient from "./FavoritesClient";

/* ============================================================
   /dashboard/favorites — server-side auth gate.
   ------------------------------------------------------------
   Security (STEP 11.72 D-F fix):
   - getCurrentUser() runs on the server (cookie → Session → User).
   - Anonymous users are redirected to /login BEFORE any HTML
     shell is served.
   - The client component (FavoritesClient) retains its own
     fetch logic to /api/favorites which has additional
     authorization (getCurrentUserId) + ownership (userId)
     checks server-side.
   - This page does NOT replace API authorization; it only
     prevents anonymous access to the UI shell.
   - Pattern matches /dashboard (root) and /dashboard/deal-rooms.
   ============================================================ */

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <FavoritesClient />;
}
