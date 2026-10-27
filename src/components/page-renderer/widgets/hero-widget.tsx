'use client';

import Hero, { type HeroConfig, type HeroStat } from '@/components/home/Hero';

type HeroWidgetProps = {
  props: Record<string, unknown>;
  data?: unknown;
};

function stringProp(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readStats(value: unknown): HeroStat[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): HeroStat[] => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.value !== 'string' || typeof candidate.label !== 'string') return [];
    if (!candidate.value.trim() || !candidate.label.trim()) return [];
    return [{ value: candidate.value, label: candidate.label }];
  }).slice(0, 4);
}

/**
 * Reuse the maintained homepage hero instead of maintaining a visually
 * divergent PageBuilder-only implementation. Older saved layouts that use
 * generic title/backgroundImage/button props remain supported.
 */
export default function HeroWidget({ props }: HeroWidgetProps) {
  const backgroundImage = stringProp(props.backgroundImage);
  const config: HeroConfig = {
    badge: stringProp(props.badge),
    title1: stringProp(props.title1) ?? stringProp(props.title),
    highlight: stringProp(props.highlight),
    subtitle: stringProp(props.subtitle) ?? stringProp(props.description),
    buttonText: stringProp(props.buttonText),
    buttonLink: stringProp(props.buttonLink),
    secondBtnText: stringProp(props.secondBtnText),
    secondBtnLink: stringProp(props.secondBtnLink),
    slide1: stringProp(props.slide1) ?? backgroundImage,
    slide2: stringProp(props.slide2) ?? backgroundImage,
    slide3: stringProp(props.slide3) ?? backgroundImage,
    cardServicesImg: stringProp(props.cardServicesImg),
    cardFeaturedImg: stringProp(props.cardFeaturedImg),
    cardExclusiveImg: stringProp(props.cardExclusiveImg),
    titleFontSize: stringProp(props.titleFontSize),
    statsWidth: stringProp(props.statsWidth),
    overlayColorCustom: stringProp(props.overlayColorCustom),
    slideOpacityCustom: stringProp(props.slideOpacityCustom),
    slideIntervalCustom: stringProp(props.slideIntervalCustom),
  };

  return <Hero config={config} stats={readStats(props.stats)} />;
}
