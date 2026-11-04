'use client';

import Link from 'next/link';

type BrandItem = {
  id?: string;
  slug: string;
  name: string;
  nameEn?: string | null;
  country?: string | null;
  logoUrl?: string | null;
};

export default function BrandGridWidget({
  props,
  data,
}: {
  props: Record<string, any>;
  data?: unknown;
}) {
  const items = Array.isArray(data) ? (data as BrandItem[]) : [];
  const limit = Math.min(24, Math.max(1, Number(props.limit) || 12));
  const columns = props.columns === '3' ? 'md:grid-cols-3' : 'md:grid-cols-4';

  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" role="status">
          برندهای فعال و منتخب پس از تکمیل کاتالوگ نمایش داده می‌شوند.
        </p>
      ) : (
        <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${columns}`}>
          {items.slice(0, limit).filter((brand) => brand?.slug && brand?.name).map((brand, index) => (
            <Link
              key={brand.id || brand.slug || index}
              href={`/brands/${encodeURIComponent(brand.slug)}`}
              className="flex min-h-24 items-center gap-3 rounded-xl border bg-white p-3 transition hover:border-[#F58220]/50 hover:shadow-sm"
            >
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-12 shrink-0 rounded-lg object-contain"
                />
              ) : (
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold">
                  {brand.name.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{brand.name}</span>
                {brand.nameEn && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{brand.nameEn}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
