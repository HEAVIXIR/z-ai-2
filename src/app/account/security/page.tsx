import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import AccountSecurityCenter from "./security-center";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const admin = await isAdmin(user.id);

  return (
    <main dir="rtl" className="min-h-screen bg-[#0b0b0b] px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#F58220]">HEAVIX ACCOUNT</p>
            <h1 className="mt-2 text-2xl font-black">پروفایل و امنیت حساب</h1>
            <p className="mt-2 text-sm text-white/50">مدیریت رمز عبور، ایمیل و شماره موبایل</p>
          </div>
          <Link href={admin ? "/admin/dashboard" : "/dashboard"} className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold text-white/70 hover:border-[#F58220] hover:text-[#F58220]">
            بازگشت به پنل
          </Link>
        </div>
        <AccountSecurityCenter />
      </div>
    </main>
  );
}
