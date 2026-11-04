'use client';

import Link from 'next/link';

export default function ListingGridWidget({
  props,
  data,
}: {
  props: Record<string, any>;
  data?: unknown;
}) {
  const items = Array.isArray(data) ? (data as Record<string, any>[]) : [];
  const cols = props.columns === '3' ? 'md:grid-cols-3' : 'md:grid-cols-4';
  const limit = Math.min(20, Math.max(1, Number(props.limit) || 8));
  const visibleItems = items.slice(0, limit).filter((item) => item && typeof item === 'object' && (item.slug || item.id));

  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      {visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" role="status">
          در حال حاضر آگهی منتشرشده‌ای برای نمایش وجود ندارد.
        </p>
      ) : (
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols}`}>
          {visibleItems.map((item, i) => (
            <Link
              key={item.id || item.slug || i}
              href={`/listings/${encodeURIComponent(String(item.slug || item.id))}`}
              className="overflow-hidden rounded-lg border bg-white shadow-sm transition hover:shadow-md"
            >
              {item.images?.[0]?.url && (
                <img
                  src={item.images[0].url}
                  alt={typeof item.title === 'string' ? item.title : ''}
                  loading="lazy"
                  decoding="async"
                  className="h-40 w-full object-cover"
                />
              )}
              <div className="p-3">
                <h3 className="truncate text-sm font-medium">{item.title}</h3>
                {props.showPrice && item.price && (
                  <p className="mt-1 text-sm font-bold text-[#F58220]">
                    {Number(item.price).toLocaleString('fa-IR')} تومان
                  </p>
                )}
                {props.showLocation && item.city && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.city}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
