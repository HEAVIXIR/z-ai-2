'use client';
import Link from 'next/link';
export default function ArticleListWidget({ props, data }: { props: Record<string, any>; data?: any }) {
  const items = (data as Record<string, any>[]) || [];
  const limit = Number(props.limit) || 6;
  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.slice(0, limit).map((item, i) => (
          <Link key={item.id || i} href={`/knowledge/${item.slug || item.id}`} className="overflow-hidden rounded-lg border bg-white">
            {item.coverImage && <img src={item.coverImage} alt={item.title} className="h-32 w-full object-cover" />}
            <div className="p-3"><h3 className="line-clamp-2 text-sm font-medium">{item.title}</h3></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
