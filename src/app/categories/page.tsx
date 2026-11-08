import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { toFa } from "@/lib/format";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ArrowLeft, FolderTree } from "lucide-react";

export const dynamic = "force-dynamic";

// Keep this public-visibility predicate local to the main-branch PR.
// The consolidated inventory branch introduces a shared helper; once that
// branch lands, this can be deduplicated without making this PR depend on it.
function getPublicListingWhere() {
  return {
    status: "PUBLISHED",
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

export const metadata: Metadata = {
  title: "دسته‌بندی‌های صنعتی و ماشین‌آلات | هویکس",
  description: "مرور دسته‌بندی‌های ماشین‌آلات سنگین، معدنی، راهسازی، قطعات و تجهیزات صنعتی در بازار هویکس.",
  alternates: { canonical: "/categories" },
  openGraph: {
    title: "دسته‌بندی‌های صنعتی هویکس",
    description: "دسته‌بندی‌های ماشین‌آلات و تجهیزات صنعتی را در هویکس مرور کنید.",
    type: "website",
    locale: "fa_IR",
  },
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  _count: { listings: number };
  children: Array<{
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    _count: { listings: number };
  }>;
};

export default async function CategoriesPage() {
  let categories: CategoryRow[] = [];
  let headerCategories: Array<{
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    icon: string | null;
  }> = [];

  try {
    [categories, headerCategories] = await Promise.all([
      db.category.findMany({
        where: { active: true, layer: "CATALOG", parentId: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          children: {
            where: { active: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              slug: true,
              icon: true,
              _count: { select: { listings: { where: getPublicListingWhere() } } },
            },
          },
          _count: { select: { listings: { where: getPublicListingWhere() } } },
        },
      }),
      db.category.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true, parentId: true, icon: true },
      }),
    ]);
  } catch (error) {
    // Keep the directory route available in Preview when its database
    // binding is not configured; runtime DB repair is tracked separately.
    console.error("[categories] directory query failed", error);
  }

  return (
    <div className="site-theme flex min-h-screen flex-col bg-[#0b0b0b]">
      <Header categories={headerCategories} />
      <main className="flex-1 pt-32">
        <div className="mx-auto max-w-[1440px] px-6 pb-16 lg:px-10">
          <nav className="mb-6 flex items-center gap-2 text-xs text-white/40">
            <Link href="/" className="hover:text-[#F58220]">خانه</Link>
            <ArrowLeft className="h-3 w-3" />
            <span className="text-white/70">دسته‌بندی‌ها</span>
          </nav>

          <header className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-l from-[#F58220]/10 via-[#141414] to-[#141414] p-8">
            <span className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#F58220]">
              <FolderTree className="h-4 w-4" />
              HEAVIX INDUSTRIAL CATALOG
            </span>
            <h1 className="text-3xl font-black text-white lg:text-4xl">
              دسته‌بندی‌های صنعتی
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
              ماشین‌آلات، قطعات، تجهیزات و خانواده‌های تخصصی صنعت را از یک ساختار یکپارچه مرور کنید.
            </p>
          </header>

          {categories.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#111] p-12 text-center">
              <FolderTree className="mx-auto mb-4 h-8 w-8 text-white/35" />
              <h2 className="text-lg font-bold text-white">دسته‌بندی‌ها در دسترس نیستند</h2>
              <p className="mt-2 text-sm text-white/45">
                فهرست دسته‌بندی‌ها پس از برقراری اتصال داده نمایش داده می‌شود.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => (
                <section key={category.id} className="rounded-3xl border border-white/10 bg-[#111] p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F58220]/10 text-2xl">
                        {category.icon ?? <FolderTree className="h-6 w-6 text-[#F58220]" />}
                      </span>
                      <div>
                        <h2 className="font-black text-white">{category.name}</h2>
                        <p className="mt-1 text-xs text-white/40">
                          {toFa(category._count.listings)} آگهی فعال
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/categories/${category.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#F58220] hover:text-white"
                    >
                      مشاهده
                      <ArrowLeft className="h-3 w-3" />
                    </Link>
                  </div>

                  {category.description && (
                    <p className="mb-4 text-xs leading-6 text-white/45">{category.description}</p>
                  )}

                  {category.children.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                      {category.children.map((child) => (
                        <Link
                          key={child.id}
                          href={`/categories/${child.slug}`}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/65 transition hover:border-[#F58220]/40 hover:text-[#F58220]"
                        >
                          {child.name}
                          <span className="mr-1 text-white/35">({toFa(child._count.listings)})</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
