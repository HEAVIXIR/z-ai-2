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
      rows: [{
        widgets: [{
          key: "listing-grid",
          props: { title: "آگهی‌های منتخب", limit: 8, columns: "4", showPrice: true, showLocation: true },
          dataSource: "listing.featured",
        }],
      }],
    },
    {
      rows: [{
        widgets: [{
          key: "listing-grid",
          props: { title: "آخرین آگهی‌ها", limit: 8, columns: "4", showPrice: true, showLocation: true },
          dataSource: "listing.latest",
        }],
      }],
    },
    {
      rows: [{
        widgets: [{
          key: "category-grid",
          props: { title: "دسته‌بندی ماشین‌آلات", limit: 12, columns: "4" },
          dataSource: "taxonomy.categories",
        }],
      }],
    },
    {
      rows: [{
        widgets: [{
          key: "brand-grid",
          props: { title: "برندهای معتبر", limit: 12, columns: "4" },
          dataSource: "brand.popular",
        }],
      }],
    },
    {
      rows: [{
        widgets: [{
          key: "service-grid",
          props: { title: "خدمات تخصصی هویکس", limit: 8, columns: "4" },
          dataSource: "service.all",
        }],
      }],
    },
    {
      rows: [{
        widgets: [{
          key: "article-list",
          props: { title: "دانش و راهنمای بازار", limit: 6 },
          dataSource: "article.latest",
        }],
      }],
    },
    {
      rows: [{
        widgets: [{
          key: "trust-badges",
          props: { title: "چرا هویکس؟" },
        }],
      }],
    },
    {
      rows: [{
        widgets: [{
          key: "cta",
          props: {
            title: "ماشین‌آلات خود را هوشمندانه معامله کنید",
            buttonText: "ثبت آگهی رایگان",
            buttonLink: "/listings/new",
          },
        }],
      }],
    },
  ],
};

export default async function HomePage() {
  // Try to load a published homepage AdminPage and public site settings.
  let layout: unknown = DEFAULT_HOME_LAYOUT;
  const [publishedPage, settings] = await Promise.all([
    db.adminPage.findFirst({
      where: { pageType: "HOME", status: "PUBLISHED" },
      include: {
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    }).catch(() => null),
    db.siteSettings.findUnique({ where: { id: "main" } }).catch(() => null),
  ]);

  try {
    if (publishedPage?.publishedVersionId) {
      const publishedVersion = await db.adminPageVersion.findUnique({
        where: { id: publishedPage.publishedVersionId },
      });
      if (publishedVersion?.layout) {
        layout = publishedVersion.layout;
      }
    }
  } catch {
    // A missing/invalid published layout must not prevent the public homepage.
  }

  const headerSettings = settings ? {
    logoUrl: settings.logoUrl,
    logoAnimationDurationMs: settings.logoAnimationDurationMs,
    logoHeight: settings.logoHeight,
    showPersianName: settings.showPersianName,
    logoPosition: settings.logoPosition,
  } : {};
  const footerSettings = settings ? {
    about: settings.about,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    workingHours: settings.workingHours,
    copyright: settings.copyright,
    newsletterEnabled: settings.newsletterEnabled,
    footerLogoUrl: settings.footerLogoUrl,
    footerLogoHeight: settings.footerLogoHeight,
    footerLogoPosition: settings.footerLogoPosition,
    footerHeavixLogoUrl: settings.footerHeavixLogoUrl,
    footerMekanixLogoUrl: settings.footerMekanixLogoUrl,
    footerAriaLogoUrl: settings.footerAriaLogoUrl,
  } : null;

  return (
    <>
      <Header siteSettings={headerSettings} />
      <main>
        <PageRenderer layout={layout} userId={null} />
      </main>
      <Footer settings={footerSettings} />
    </>
  );
}
