/**
 * HEAVIX — /community — Coming Soon placeholder
 * ------------------------------------------------------------
 * STEP 13.01-R1 P0-1 FIX v2:
 * The previous 376-line client component fetched /api/questions
 * which returned 500 (Question model wasn't seeded in catalog).
 * This page is intentionally a minimal "coming soon" server
 * component to remove the broken UX and SEO error.
 *
 * NOTE on .bak file: NO `page.tsx.bak` file has ever existed in
 * git history. Verified via:
 *   git log --all --diff-filter=D --name-only -- "src/app/community/page.tsx.bak"
 * (empty result). The earlier PR body claim about removing the
 * .bak file was incorrect — there was nothing to remove in git.
 */

import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "جامعه هویکس — به‌زودی",
  description: "صفحه جامعه کاربران هویکس به‌زودی فعال خواهد شد.",
  robots: { index: false, follow: true },
};

export default function CommunityComingSoon() {
  return (
    <div className="site-theme flex min-h-screen flex-col bg-[#0b0b0b]">
      <Header categories={[]} />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <MessageCircle className="mb-6 h-16 w-16 text-[#F58220]" />
        <h1 className="mb-3 text-2xl font-bold text-white">
          جامعه هویکس به‌زودی فعال می‌شود
        </h1>
        <p className="mb-8 max-w-md text-sm leading-relaxed text-zinc-400">
          ما در حال توسعه بخش پرسش‌وپاسخ جامعه هستیم. این قابلیت به‌زودی در
          دسترس شما قرار خواهد گرفت.
        </p>
        <Link
          href="/"
          className="rounded-lg bg-[#F58220] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#e0741c]"
        >
          بازگشت به صفحه اصلی
        </Link>
      </main>
      <Footer />
    </div>
  );
}
