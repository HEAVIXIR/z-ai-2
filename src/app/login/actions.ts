"use server";

import { redirect } from "next/navigation";
import { createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, isLegacyBcryptHash, verifyPassword } from "@/lib/password";
import { isAdmin } from "@/lib/authorization";

export async function loginAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) redirect("/login?error=1");

  const user = await db.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { mobile: identifier }] },
  });
  if (!user || user.status !== "ACTIVE" || !user.emailVerified) redirect("/login?error=1");

  const allowLegacyBcrypt = process.env.HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT !== "false";
  const legacyBcryptHash = isLegacyBcryptHash(user.passwordHash);
  if (!(await verifyPassword(password, user.passwordHash, { allowLegacyBcrypt }))) redirect("/login?error=1");

  const migratedPasswordHash =
    legacyBcryptHash && allowLegacyBcrypt ? await hashPassword(password) : undefined;
  const loginWrite = await db.user.updateMany({
    where: {
      id: user.id,
      passwordHash: user.passwordHash,
      status: "ACTIVE",
      emailVerified: true,
    },
    data: {
      lastLoginAt: new Date(),
      ...(migratedPasswordHash ? { passwordHash: migratedPasswordHash } : {}),
    },
  });
  if (loginWrite.count !== 1) redirect("/login?error=1");
  await createUserSession(user.id);
  redirect((await isAdmin(user.id)) ? "/admin/dashboard" : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const { destroyUserSession } = await import("@/lib/auth");
  await destroyUserSession();
  redirect("/login");
}
