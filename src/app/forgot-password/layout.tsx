import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "بازیابی رمز عبور | هویکس",
  robots: { index: false, follow: false },
};

export default function PrivatePageLayout({ children }: { children: ReactNode }) {
  return children;
}
