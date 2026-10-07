"use server";

import { redirect } from "next/navigation";
import { createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { isAdmin } from "@/lib/authorization";

export async function loginAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) redirect("/login?error=1");

  const user = await db.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { mobile: identifier }] },
  });
  if (!user || user.status === "BLOCKED") redirect("/login?error=1");

  if (!(await verifyPassword(password, user.passwordHash))) redirect("/login?error=1");

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createUserSession(user.id);
  redirect((await isAdmin(user.id)) ? "/admin/dashboard" : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const { destroyUserSession } = await import("@/lib/auth");
  await destroyUserSession();
  redirect("/login");
}
