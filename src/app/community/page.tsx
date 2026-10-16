import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

/* ============================================================
   /community — Community Q&A (coming soon)
   ------------------------------------------------------------
   STEP 13.01 P0-1 FIX: The previous /community page was a client
   component that fetched /api/questions and /api/questions/[qid]/
   answers — but NO such API routes exist anywhere in src/app/api/.
   Every interaction on the page returned 404.

   Fix: The page is replaced with a "coming soon" server component.
   The original client component is preserved as page.tsx.bak for
   reference when the Q&A API is implemented in a future PR.

   To re-enable:
     1. Implement /api/questions (GET, POST) + /api/questions/[qid]
        (GET) + /api/questions/[qid]/answers (GET, POST)
     2. Add Question + Answer models to prisma/schema.prisma
     3. Restore page.tsx.bak → page.tsx
     4. Remove this placeholder
   ============================================================ */

export default function CommunityComingSoon() {
  return (
    <div className="site-theme flex min-h-screen flex-col bg-[#0b0b0b]">
      <Header categories={[]} />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <MessageCircle className="mb-6 h-16 w-16 text-[#F58220]" />
        <h1 className="mb-3 text-2xl font-bold text-white">
          انجمن问答 به‌زودی فعال می‌شود
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
