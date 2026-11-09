'use client';

import ListingCard, { type ListingCardData } from '@/components/listings/ListingCard';

type ListingApiItem = Record<string, any>;

function parsePrice(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    try { return BigInt(value); } catch { return null; }
  }
  return null;
}

function toListingCardData(item: ListingApiItem): ListingCardData {
  const brand = item.brand && typeof item.brand === 'object' ? item.brand : null;
  const category = item.category && typeof item.category === 'object' ? item.category : null;
  const firstImage = Array.isArray(item.images) ? item.images[0] : null;
  const year = Number(item.year);
  const workingHours = Number(item.workingHours);

  return {
    id: String(item.id),
    slug: String(item.slug),
    title: typeof item.title === 'string' ? item.title : 'آگهی ماشین‌آلات',
    shortDesc: typeof item.shortDesc === 'string' ? item.shortDesc : null,
    description: typeof item.description === 'string' ? item.description : null,
    brandName: typeof brand?.name === 'string' ? brand.name : null,
    price: parsePrice(item.price),
    priceType: typeof item.priceType === 'string' ? item.priceType : 'CALL_FOR_PRICE',
    image: typeof firstImage?.url === 'string'
      ? firstImage.url
      : typeof item.image === 'string' ? item.image : null,
    icon: typeof category?.icon === 'string' ? category.icon : null,
    year: Number.isSafeInteger(year) && year > 0 ? year : null,
    city: typeof item.city === 'string' && item.city.trim() ? item.city : null,
    province: typeof item.province === 'string' && item.province.trim() ? item.province : null,
    workingHours: Number.isFinite(workingHours) && workingHours >= 0 ? workingHours : null,
    condition: typeof item.condition === 'string' ? item.condition : null,
    featured: item.featured === true,
    viewCount: Number.isSafeInteger(Number(item.viewCount)) ? Number(item.viewCount) : undefined,
    favoriteCount: Number.isSafeInteger(Number(item.favoriteCount)) ? Number(item.favoriteCount) : undefined,
  };
}

export default function ListingGridWidget({
  props,
  data,
}: {
  props: Record<string, any>;
  data?: unknown;
}) {
  const items = Array.isArray(data) ? (data as ListingApiItem[]) : [];
  const columns = props.columns === '2'
    ? 'md:grid-cols-2'
    : props.columns === '3'
      ? 'md:grid-cols-3'
      : 'md:grid-cols-4';
  const limit = Math.min(20, Math.max(1, Number(props.limit) || 8));
  const visibleItems = items
    .slice(0, limit)
    .filter((item) => item && typeof item === 'object' && (item.slug || item.id));

  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      {visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" role="status">
          در حال حاضر آگهی منتشرشده‌ای برای نمایش وجود ندارد.
        </p>
      ) : (
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${columns}`}>
          {visibleItems.map((item, index) => (
            <ListingCard
              key={String(item.id || item.slug || index)}
              l={toListingCardData(item)}
              showPrice={props.showPrice !== false}
              showLocation={props.showLocation !== false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
