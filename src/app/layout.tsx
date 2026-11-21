import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import MobileNav from "@/components/layout/MobileNav";
import { IS_PREVIEW_DEPLOYMENT, SITE_BASE_URL } from "@/lib/site-config";

export const metadata: Metadata = {
  // SITE_BASE_URL is the single source of truth for canonical URLs.
  metadataBase: new URL(SITE_BASE_URL),
  title: {
    default: "هویکس | بزرگ‌ترین مارکت‌پلیس ماشین‌آلات سنگین ایران",
    template: "%s | هویکس",
  },
  description:
    "خرید، فروش و اجاره ماشین‌آلات سنگین: بیل مکانیکی، لودر، بلدوزر، گریدر، دامپ‌تراک، جرثقیل و قطعات یدکی. شبکه سراسری دیلرها و متخصصین.",
  keywords: [
    "ماشین آلات سنگین",
    "بیل مکانیکی",
    "لودر",
    "بلدوزر",
    "گریدر",
    "دامپ تراک",
    "جرثقیل",
    "فروش ماشین آلات",
    "اجاره ماشین آلات",
    "قطعات یدکی",
    "هویکس",
    "HEAVIX",
  ],
  authors: [{ name: "آریا ماشین جم" }],
  // A noindex Preview must not advertise the production canonical URL.
  // Omit canonical entirely in Preview; production keeps the root canonical.
  ...(!IS_PREVIEW_DEPLOYMENT ? { alternates: { canonical: "/" } } : {}),
  openGraph: {
    title: "هویکس | مارکت‌پلیس ماشین‌آلات سنگین ایران",
    description: "بزرگ‌ترین مارکت‌پلیس ماشین‌آلات سنگین ایران.",
    type: "website",
    locale: "fa_IR",
    siteName: "هویکس",
  },
  // Preview pages must remain crawlable so crawlers can see this directive,
  // but must never be indexed. Production keeps the normal index policy.
  robots: IS_PREVIEW_DEPLOYMENT
    ? { index: false, follow: false, noarchive: true }
    : { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen bg-[#0b0b0b] pb-16 text-white antialiased lg:pb-0">
        {children}
        <MobileNav />
        <Toaster />
      </body>
    </html>
  );
}
