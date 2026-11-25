import { redirect } from "next/navigation";

/**
 * /admin/brands — redirects to the single brand management center.
 *
 * The full brand CRUD (list, search, create, edit, delete, verify)
 * lives at /admin/taxonomy/brands. This redirect consolidates all
 * admin entry points to ONE management page.
 *
 * The hub page (with link cards) was replaced because it added a
 * navigation layer without management value. The stats header
 * (total/active/verified/families counts) was moved into the
 * taxonomy/brands page itself.
 */
export default function AdminBrandsHubPage() {
  redirect("/admin/taxonomy/brands");
}
