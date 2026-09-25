'use client';
import Link from 'next/link';
export default function CategoryGridWidget({ props, data }: { props: Record<string, any>; data?: any }) {
  const items = (data as Record<string, any>[]) || [];
  const cols = props.columns === '3' ? 'md:grid-cols-3' : 'md:grid-cols-4';
  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      <div className={`grid grid-cols-2 ${cols} gap-3`}>
        {items.map((item, i) => (
          <Link key={item.id || i} href={`/categories/${item.slug || item.id}`} className="flex items-center gap-2 rounded-lg border p-3 hover:shadow-sm">
            {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="size-8 rounded" />}
            <span className="text-sm font-medium">{item.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
