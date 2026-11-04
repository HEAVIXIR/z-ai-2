'use client';

import Link from 'next/link';

export default function CategoryGridWidget({
  props,
  data,
}: {
  props: Record<string, any>;
  data?: unknown;
}) {
  const items = Array.isArray(data) ? (data as Record<string, any>[]) : [];
  const cols = props.columns === '3' ? 'md:grid-cols-3' : 'md:grid-cols-4';
  const limit = Math.min(24, Math.max(1, Number(props.limit) || 12));
  const visibleItems = items.filter((item) => item && typeof item === 'object' && (item.slug || item.id) && typeof item.name === 'string');

  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      {visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" role="status">
          دسته‌بندی‌های فعال پس از آماده‌سازی کاتالوگ نمایش داده می‌شوند.
        </p>
      ) : (
        <div className={`grid grid-cols-2 gap-3 ${cols}`}>
          {visibleItems.slice(0, limit).map((item, i) => (
            <Link
              key={item.id || item.slug || i}
              href={`/categories/${encodeURIComponent(String(item.slug || item.id))}`}
              className="flex items-center gap-2 rounded-lg border p-3 transition hover:border-[#F58220]/50 hover:shadow-sm"
            >
              {item.imageUrl && (
                <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="size-8 rounded object-cover" />
              )}
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
