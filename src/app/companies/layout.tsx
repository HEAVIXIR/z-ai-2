import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "شرکت‌های ماشین‌آلات سنگین — فروشندگان و نمایندگان",
  description: "فهرست شرکت‌های فعال در حوزه ماشین‌آلات سنگین: فروشندگان، نمایندگان، اجاره‌دهندگان و خدمات‌دهندگان.",
  alternates: { canonical: "/companies" },
  openGraph: { title: "شرکت‌های ماشین‌آلات سنگین | هویکس", description: "فهرست شرکت‌های فعال.", type: "website", locale: "fa_IR" },
};

export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
