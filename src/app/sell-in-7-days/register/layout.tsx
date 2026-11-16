import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ثبت درخواست فروش دستگاه | هویکس",
  robots: { index: false, follow: true },
};

export default function PrivatePageLayout({ children }: { children: ReactNode }) {
  return children;
}
