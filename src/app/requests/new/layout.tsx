import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ثبت درخواست خرید | هویکس",
  robots: { index: false, follow: false },
};

export default function NewRequestLayout({ children }: { children: ReactNode }) {
  return children;
}
