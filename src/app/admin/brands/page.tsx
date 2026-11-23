import { redirect } from "next/navigation";

/**
 * Canonical brand-management entry point.
 * The old read-only /admin/brands card grid is replaced by the searchable,
 * paginated, editable Global Brand Registry.
 */
export default function AdminBrandsRedirect() {
  redirect("/admin/taxonomy/brands");
}
