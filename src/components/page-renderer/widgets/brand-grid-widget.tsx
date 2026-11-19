'use client';

import Link from "next/link";

type BrandCard = {
  id?: string;
  slug: string;
  name: string;
  nameEn?: string | null;
  logoUrl?: string | null;
  listingsCount?: number;
};

export default function BrandGridWidget({
  props,
  data,
}: {
  props: Record<string, any>;
  data?: unknown;
}) {
  const items = (Array.isArray(data) ? data : []).filter(
    (item): item is BrandCard =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as BrandCard).slug === "string" &&
          typeof (item as BrandCard).name === "string",
      ),
  );
  const limit = Math.max(1, Math.min(24, Number(props.limit) || 12));
  const visible = items.slice(0, limit);

  if (visible.length === 0) return null;

  return (
    <div>
      {typeof props.title === "string" && props.title ? (
        <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {visible.map((brand) => (
          <Link
            key={brand.id || brand.slug}
            href={`/brands/${encodeURIComponent(brand.slug)}`}
            className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg border bg-white p-4 text-center transition hover:shadow-sm"
          >
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt=""
                loading="lazy"
                className="h-12 max-w-full object-contain"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-bold"
              >
                {brand.name.slice(0, 1)}
              </span>
            )}
            <span className="line-clamp-2 text-sm font-medium">{brand.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
