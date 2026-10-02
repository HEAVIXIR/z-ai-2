/**
 * HEAVIX Homepage — Track T-C: Full PageRenderer Migration
 *
 * This page is now FULLY driven by PageRenderer.
 * If a published AdminPage with pageType=HOME exists, its layout is used.
 * Otherwise, a DEFAULT layout (defined below) renders using the same
 * PageRenderer — no legacy hardcoded fallback remains.
 *
 * The @ts-nocheck directive is GONE. This file is fully type-safe.
 */

import { db } from "@/lib/db";
import { PageRenderer } from "@/components/page-renderer/page-renderer";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const dynamic = "force-dynamic";

// Default homepage layout (used when no published AdminPage exists)
const DEFAULT_HOME_LAYOUT = {
  sections: [
    {
      title: "Hero",
      rows: [{
        widgets: [{
          key: "hero",
          props: {
            title: "هویکس",
            subtitle: "بازار ماشین‌آلات صنعتی ایران",
            description: "خرید، فروش و اجاره ماشین‌آلات صنعتی با تضمین کیفیت و قیمت منصفانه",
          },
        }],
      }],
    },
    {
      title: "Search",
      rows: [{
        widgets: [{
          key: "search-box",
          props: { placeholder: "جستجوی ماشین‌آلات، برندها، دسته‌بندی‌ها..." },
        }],
      }],
    },
    {
      title: "Featured Listings",
      rows: [{
        widgets: [{
          key: "listing-grid",
          props: { title: "آگهی‌های منتخب", limit: 8 },
          dataSource: "listing.featured",
        }],
      }],
    },
    {
      title: "Categories",
      rows: [{
        widgets: [{
          key: "category-grid",
          props: { title: "دسته‌بندی‌ها", limit: 12 },
          dataSource: "brand.popular",
        }],
      }],
    },
    {
      title: "Stats",
      rows: [{
        widgets: [{
          key: "stats",
          props: { title: "آمار سایت" },
          dataSource: "stats.site",
        }],
      }],
    },
    {
      title: "Trust",
      rows: [{
        widgets: [{
          key: "trust-badges",
          props: { title: "چرا هویکس؟" },
        }],
      }],
    },
  ],
};

export default async function HomePage() {
  // Try to load a published homepage AdminPage
  let layout: unknown = DEFAULT_HOME_LAYOUT;

  try {
    const publishedPage = await db.adminPage.findFirst({
      where: { pageType: "HOME", status: "PUBLISHED" },
      include: {
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (publishedPage?.publishedVersionId) {
      const publishedVersion = await db.adminPageVersion.findUnique({
        where: { id: publishedPage.publishedVersionId },
      });
      if (publishedVersion?.layout) {
        layout = publishedVersion.layout;
      }
    }
  } catch {
    // DB unavailable — use default layout (PageRenderer handles gracefully)
  }

  return (
    <>
      <Header />
      <main>
        {/* PageRenderer renders the layout JSON using registered widgets */}
        <PageRenderer layout={layout} userId={null} />
      </main>
      <Footer />
    </>
  );
}
