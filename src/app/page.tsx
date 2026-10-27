/**
 * HEAVIX Homepage — Track T-C: Full PageRenderer Migration
 *
 * This page is fully driven by PageRenderer. A published AdminPage with
 * pageType=HOME takes precedence; otherwise the reference-aligned default
 * layout below is rendered through the same maintained widget registry.
 */

import { db } from "@/lib/db";
import { PageRenderer } from "@/components/page-renderer/page-renderer";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const dynamic = "force-dynamic";

// Default homepage layout follows the supplied HEAVIX visual reference:
// dark machinery hero, orange-highlighted headline, two clear actions,
// floating search panel, featured listings, and catalog categories.
const DEFAULT_HOME_LAYOUT = {
  sections: [
    {
      title: "Hero",
      rows: [{
        widgets: [{
          key: "hero",
          props: {
            title: "خرید، فروش و اجاره",
            title1: "خرید، فروش و اجاره",
            highlight: "ماشین‌آلات سنگین",
            badge: "بازار تخصصی ماشین‌آلات سنگین",
            subtitle: "خرید، فروش و اجاره ماشین‌آلات سنگین، قطعات و خدمات صنعتی در ایران.",
            buttonText: "ثبت آگهی رایگان",
            buttonLink: "/listings/new",
            secondBtnText: "مشاهده آگهی‌ها",
            secondBtnLink: "/listings",
            slide1: "/images/hero/hero-construction.png",
            slide2: "/images/hero/hero-mining.png",
            slide3: "/images/hero/hero-road.png",
            cardServicesImg: "/images/hero/card-services.png",
            cardFeaturedImg: "/images/hero/card-featured.png",
            cardExclusiveImg: "/images/hero/card-exclusive.png",
            titleFontSize: "normal",
            statsWidth: "normal",
            overlayColorCustom: "#0b0b0b",
            slideOpacityCustom: "0.55",
            slideIntervalCustom: "5000",
          },
        }],
      }],
    },
    {
      title: "Search",
      rows: [{
        widgets: [{
          key: "search-box",
          props: {
            placeholder: "نام مدل، برند یا توضیحات... مانند PC220",
            showFilters: true,
          },
        }],
      }],
    },
    {
      title: "Featured Listings",
      rows: [{
        widgets: [{
          key: "listing-grid",
          props: { title: "آگهی‌های منتخب", limit: 8, columns: "4" },
          dataSource: "listing.featured",
        }],
      }],
    },
    {
      title: "Categories",
      rows: [{
        widgets: [{
          key: "category-grid",
          props: { title: "دسته‌بندی‌ها", limit: 12, columns: "4" },
          dataSource: "taxonomy.categories",
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
  // Try to load a published homepage AdminPage.
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
    // DB unavailable — use default layout (PageRenderer handles gracefully).
  }

  return (
    <>
      <Header />
      <main>
        <PageRenderer layout={layout} userId={null} />
      </main>
      <Footer />
    </>
  );
}
