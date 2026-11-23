import { redirect } from "next/navigation";

export default function AdminBrandCreateRedirect() {
  redirect("/admin/taxonomy/brands/new");
}
