import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SellerLeadsClient from "./SellerLeadsClient";

/* ============================================================
   /seller/leads — server-side auth gate.
   ------------------------------------------------------------
   Security (STEP 11.72 D-F fix):
   - getCurrentUser() runs on the server (cookie → Session → User).
   - Anonymous users are redirected to /login BEFORE any HTML
     shell is served.
   - The client component (SellerLeadsClient) retains its own
     fetch logic to /api/seller/leads which has additional
     authorization (getCurrentUser + can(store.crm.read)) +
     ownership (sellerId === user.id) checks server-side.
   - This page does NOT replace API authorization; it only
     prevents anonymous access to the UI shell.
   - Pattern matches /seller/dashboard (uses redirect with query
     param to preserve return URL).
   ============================================================ */

export const dynamic = "force-dynamic";

export default async function SellerLeadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/seller/leads");

  return <SellerLeadsClient />;
}
