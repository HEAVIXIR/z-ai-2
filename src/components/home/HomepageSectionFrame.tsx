import type { CSSProperties, ReactNode } from "react";

type Design = {
  backgroundColor?: string;
  textColor?: string;
  headingColor?: string;
  accentColor?: string;
  paddingTop?: string;
  paddingBottom?: string;
  contentMaxWidth?: string;
  baseFontSize?: string;
  headingFontSize?: string;
  fontFamily?: string;
  textAlign?: "right" | "center" | "left";
  animation?: "legacy" | "none" | "fade" | "slide-up" | "zoom" | "float";
  animationDurationMs?: number;
  animationDelayMs?: number;
  columns?: number;
  cardGap?: string;
  imageRadius?: string;
};

function safeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|transparent)$/.test(v) ? v : undefined;
}
function safeLength(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return /^(0|\d+(?:\.\d+)?(?:px|rem|em|vw|vh|%))$/.test(v) ? v : undefined;
}
function readDesign(config: unknown): Design {
  try {
    const parsed = typeof config === "string" ? JSON.parse(config) : config;
    return parsed && typeof parsed === "object" && parsed.design && typeof parsed.design === "object"
      ? parsed.design as Design
      : {};
  } catch {
    return {};
  }
}

export default function HomepageSectionFrame({
  sectionKey,
  config,
  children,
}: {
  sectionKey: string;
  config?: string | null;
  children: ReactNode;
}) {
  const d = readDesign(config);
  const animation = d.animation && d.animation !== "legacy" ? d.animation : "none";
  const duration = Number.isFinite(d.animationDurationMs) ? Math.min(10000, Math.max(100, Number(d.animationDurationMs))) : 700;
  const delay = Number.isFinite(d.animationDelayMs) ? Math.min(5000, Math.max(0, Number(d.animationDelayMs))) : 0;
  const columns = Number.isInteger(d.columns) ? Math.min(6, Math.max(1, Number(d.columns))) : undefined;
  const style = {
    backgroundColor: safeColor(d.backgroundColor),
    color: safeColor(d.textColor),
    paddingTop: safeLength(d.paddingTop),
    paddingBottom: safeLength(d.paddingBottom),
    fontSize: safeLength(d.baseFontSize),
    fontFamily: d.fontFamily && ["inherit", "Vazirmatn, sans-serif", "Arial, sans-serif", "Inter, sans-serif"].includes(d.fontFamily) ? d.fontFamily : undefined,
    textAlign: d.textAlign,
    ["--hp-heading-color" as string]: safeColor(d.headingColor),
    ["--hp-accent-color" as string]: safeColor(d.accentColor),
    ["--hp-heading-size" as string]: safeLength(d.headingFontSize),
    ["--hp-content-max-width" as string]: safeLength(d.contentMaxWidth),
    ["--hp-card-columns" as string]: columns ? String(columns) : undefined,
    ["--hp-card-gap" as string]: safeLength(d.cardGap),
    ["--hp-image-radius" as string]: safeLength(d.imageRadius),
    ["--hp-motion-duration" as string]: `${duration}ms`,
    ["--hp-motion-delay" as string]: `${delay}ms`,
  } as CSSProperties;

  return (
    <div
      className={`hp-section-frame hp-section-motion-${animation}`}
      data-homepage-section={sectionKey}
      style={style}
    >
      {children}
    </div>
  );
}
