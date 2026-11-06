import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ArrowLeft, Cog } from "lucide-react";

export const dynamic = "force-dynamic";

async function getActiveModelsBySlug(slug: string) {
  const rows = await db.productModel.findMany({
    where: { slug, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      brand: { select: { name: true, slug: true, active: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 20,
  });
  type ActiveModel = (typeof rows)[number] & {
    brand: NonNullable<(typeof rows)[number]["brand"]>;
  };
  return rows.filter(
    (model): model is ActiveModel => Boolean(model.brand?.active && model.brand.slug),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const models = await getActiveModelsBySlug(slug);

  if (models.length === 1) {
    const model = models[0];
    return {
      title: `${model.brand.name} ${model.name} | هویکس`,
      alternates: {
        canonical: `/brands/${encodeURIComponent(model.brand.slug)}/models/${encodeURIComponent(model.slug)}`,
      },
      robots: { index: false, follow: true },
    };
  }

  if (models.length > 1) {
    return {
      title: `انتخاب برند برای ${models[0].name} | هویکس`,
      description: "برای مشاهده مشخصات دقیق مدل، برند سازنده را انتخاب کنید.",
      robots: { index: false, follow: true },
    };
  }

  return {
    title: "مدل یافت نشد | هویکس",
    robots: { index: false, follow: false },
  };
}

/**
 * Legacy route retained for old links. Unique slugs permanently redirect to
 * the brand-scoped canonical URL. Ambiguous slugs show a selector instead of
 * silently rendering an arbitrary brand's model.
 */
export default async function LegacyModelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const models = await getActiveModelsBySlug(slug);

  if (models.length === 0) notFound();

  if (models.length === 1) {
    const model = models[0];
    permanentRedirect(
      `/brands/${encodeURIComponent(model.brand.slug)}/models/${encodeURIComponent(model.slug)}`,
    );
  }

  const headerCats = await db.category.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true, parentId: true, icon: true },
  });

  return (
    <div className="site-theme flex min-h-screen flex-col bg-[#0b0b0b]">
      <Header categories={headerCats} />
      <main className="flex-1 pt-32">
        <div className="mx-auto max-w-[1100px] px-6 lg:px-10">
          <nav className="mb-6 flex items-center gap-2 text-xs text-white/40">
            <Link href="/" className="hover:text-[#F58220]">خانه</Link>
            <ArrowLeft className="h-3 w-3" />
            <span className="text-white/70">انتخاب برند</span>
          </nav>
          <div className="rounded-3xl border border-white/10 bg-[#111] p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F58220]/15">
                <Cog className="h-6 w-6 text-[#F58220]" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">
                  انتخاب برند برای مدل «{models[0].name}»
                </h1>
                <p className="mt-2 text-sm leading-6 text-white/50">
                  این نام مدل برای چند برند ثبت شده است. برای جلوگیری از نمایش مشخصات اشتباه، برند سازنده را انتخاب کنید.
                </p>
              </div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((model) => (
                <Link
                  key={model.id}
                  href={`/brands/${encodeURIComponent(model.brand.slug)}/models/${encodeURIComponent(model.slug)}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#F58220]/40 hover:bg-[#F58220]/[0.05]"
                >
                  <span className="text-xs font-bold text-[#F58220]">{model.brand.name}</span>
                  <h2 className="mt-2 text-base font-black text-white">{model.name}</h2>
                  {model.nameEn && (
                    <p className="mt-1 text-xs text-white/40" dir="ltr">{model.nameEn}</p>
                  )}
                  <span className="mt-4 inline-flex items-center gap-1 text-xs text-white/50">
                    مشاهده مدل <ArrowLeft className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
