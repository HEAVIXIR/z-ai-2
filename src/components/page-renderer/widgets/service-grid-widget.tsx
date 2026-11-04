'use client';

type ServiceItem = {
  id?: string;
  key?: string;
  nameFa: string;
  nameEn?: string | null;
  description?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
};

export default function ServiceGridWidget({
  props,
  data,
}: {
  props: Record<string, any>;
  data?: unknown;
}) {
  const items = Array.isArray(data) ? (data as ServiceItem[]) : [];
  const limit = Math.min(24, Math.max(1, Number(props.limit) || 8));
  const columns = props.columns === '3' ? 'md:grid-cols-3' : 'md:grid-cols-4';

  return (
    <div>
      {props.title && <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" role="status">
          خدمات تخصصی پس از تکمیل فهرست خدمات هویکس نمایش داده می‌شوند.
        </p>
      ) : (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${columns}`}>
          {items.slice(0, limit).filter((service) => service?.nameFa).map((service, index) => (
            <article
              key={service.id || service.key || index}
              className="flex min-h-28 items-start gap-3 rounded-xl border bg-white p-4"
            >
              {service.imageUrl ? (
                <img
                  src={service.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[#F58220]/10 text-xl text-[#F58220]">
                  {service.icon || '⚙️'}
                </span>
              )}
              <span className="min-w-0">
                <span className="block font-bold">{service.nameFa}</span>
                {service.nameEn && <span className="block text-xs text-muted-foreground" dir="ltr">{service.nameEn}</span>}
                {service.description && <span className="mt-1 block line-clamp-2 text-xs leading-6 text-muted-foreground">{service.description}</span>}
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
