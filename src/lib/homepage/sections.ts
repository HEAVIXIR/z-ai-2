/**
 * Canonical HEAVIX homepage section composition.
 *
 * The database remains authoritative for existing section settings.
 * Missing canonical sections are supplied in memory only, never written
 * during a public request. Explicitly disabled rows remain disabled.
 */
export const DEFAULT_HOME_SECTIONS = [
  { key: "hero", title: "هیرو و جستجو", order: 1, active: true },
  { key: "categories", title: "دسته‌بندی ماشین‌آلات", order: 2, active: true },
  { key: "hot-searches", title: "داغ‌ترین بازار امروز", order: 3, active: true },
  { key: "stats", title: "آمار پلتفرم", order: 4, active: true },
  { key: "recommendations", title: "پیشنهادها برای شما", order: 5, active: true },
  { key: "verified-machines", title: "ماشین‌آلات تأییدشدهٔ هویکس", order: 6, active: true },
  { key: "featured-machines", title: "آگهی‌های ویژه", order: 7, active: true },
  { key: "active-requests", title: "درخواست‌های فعال خرید", order: 8, active: true },
  { key: "exclusive-sale", title: "فروش ویژه", order: 9, active: true },
  { key: "services", title: "خدمات هویکس", order: 10, active: true },
  { key: "latest-ads", title: "آخرین آگهی‌ها", order: 11, active: true },
  { key: "sell7", title: "فروش در ۷ روز", order: 12, active: true },
  { key: "why-us", title: "چرا هویکس؟", order: 13, active: true },
  { key: "trusted-brands", title: "برندهای مورد اعتماد", order: 14, active: true },
  { key: "brands", title: "برندهای معتبر", order: 15, active: false },
  { key: "knowledge", title: "هویکس دانش", order: 16, active: true },
  { key: "cta", title: "دعوت به اقدام", order: 17, active: true },
] as const;

export type HomepageSectionConfig = {
  id: string;
  key: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  order: number;
  active: boolean;
  config?: string | null;
};

export function mergeHomepageSections<T extends HomepageSectionConfig>(
  rows: readonly T[],
): Array<T | HomepageSectionConfig> {
  const existingKeys = new Set(rows.map((row) => row.key));
  const defaults: HomepageSectionConfig[] = DEFAULT_HOME_SECTIONS
    .filter((section) => !existingKeys.has(section.key))
    .map((section) => ({
      id: `default-${section.key}`,
      key: section.key,
      title: section.title,
      subtitle: null,
      description: null,
      order: section.order,
      active: section.active,
      config: "{}",
    }));

  return [...rows, ...defaults].sort((a, b) => a.order - b.order);
}
