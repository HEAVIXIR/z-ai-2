"use client";

import type { ReactNode } from "react";

/**
 * ScrollReveal — progressive-enhancement wrapper.
 * Homepage content remains readable if client hydration or IntersectionObserver
 * is delayed or unavailable in an edge preview runtime.
 */
export default function ScrollReveal({
  children,
  id,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  id?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={`transition-all duration-700 ease-out opacity-100 translate-y-0 ${className}`}
    >
      {children}
    </div>
  );
}
