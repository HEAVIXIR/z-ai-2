'use client';

import Link from 'next/link';

export default function ArticleListWidget({
  props,
  data,
}: {
  props: Record<string, any>;
  data?: unknown;
}) {
  const items = Array.isArray(data) ? (data as Record<string, any>[]) : [];
  const limit = Math.min(20, Math.max(1, Number(props.limit) || 6));
  const visibleItems = items.slice(0, limit).filter((item) => item && typeof item === 'object' && (item.slug || item.id) && typeof item.title === 'string');

  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      {visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" role="status">
          راهنماها و مقاله‌های منتشرشده به‌زودی در این بخش نمایش داده می‌شوند.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {visibleItems.map((item, i) => (
            <Link
              key={item.id || item.slug || i}
              href={`/articles/${encodeURIComponent(String(item.slug || item.id))}`}
              className="overflow-hidden rounded-lg border border-white/10 bg-[#141414] text-white transition hover:border-[#F58220]/40 hover:shadow-sm"
            >
              {item.coverImage && (
                <img
                  src={item.coverImage}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-32 w-full object-cover"
                />
              )}
              <div className="p-3">
                <h3 className="line-clamp-2 text-sm font-medium">{item.title}</h3>
                {typeof item.excerpt === 'string' && (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/60">{item.excerpt}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
