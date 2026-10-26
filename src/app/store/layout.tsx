import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "فروشگاه قطعات و لوازم یدکی",
  description: "جست‌وجو و خرید قطعات و لوازم یدکی در فروشگاه هویکس.",
  alternates: { canonical: "/store" },
  robots: { index: true, follow: true },
};

export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
