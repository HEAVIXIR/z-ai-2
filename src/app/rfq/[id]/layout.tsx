import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "جزئیات درخواست خرید | هویکس",
  robots: { index: false, follow: false },
};

export default function PrivateRFQLayout({ children }: { children: ReactNode }) {
  return children;
}
