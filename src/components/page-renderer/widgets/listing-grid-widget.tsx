'use client';
import Link from 'next/link';
export default function ListingGridWidget({ props, data }: { props: Record<string, any>; data?: any }) {
  const items = (data as Record<string, any>[]) || [];
  const cols = props.columns === '3' ? 'md:grid-cols-3' : 'md:grid-cols-4';
  const limit = Number(props.limit) || 8;
  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cols}`}>
        {items.slice(0, limit).map((item, i) => (
          <Link key={item.id || i} href={`/listings/${item.slug || item.id}`} className="overflow-hidden rounded-lg border bg-white shadow-sm hover:shadow-md">
            {item.images?.[0]?.url && <img src={item.images[0].url} alt={item.title} className="h-40 w-full object-cover" />}
            <div className="p-3">
              <h3 className="truncate text-sm font-medium">{item.title}</h3>
              {props.showPrice && item.price && <p className="mt-1 text-sm font-bold text-[#F58220]">{Number(item.price).toLocaleString('fa-IR')} ت</p>}
              {props.showLocation && item.city && <p className="mt-0.5 text-xs text-muted-foreground">{item.city}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
