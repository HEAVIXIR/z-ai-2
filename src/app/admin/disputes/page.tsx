import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/* =========================================================
   /admin/disputes — alias to the universal resource table.

   Disputes are managed through the generic admin resource
   framework (see src/lib/admin/resource-index.ts →
   disputeConfig in marketplace-resources.ts). This page keeps
   the path `/admin/disputes` reachable so direct nav links,
   bookmarks, and breadcrumbs all land on the canonical UI.

   No new domain model, API, or permission — everything reuses
   the existing dispute resource (registered in the registry
   with permission `deal.read` and audit enabled).
   ========================================================= */

export default function AdminDisputesPage() {
  redirect("/admin/resources/disputes");
}
