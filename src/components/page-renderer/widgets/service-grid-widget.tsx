'use client';

type ServiceCard = {
  id?: string;
  key?: string;
  nameFa: string;
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
  const items = (Array.isArray(data) ? data : []).filter(
    (item): item is ServiceCard =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as ServiceCard).nameFa === "string",
      ),
  );
  const limit = Math.max(1, Math.min(24, Number(props.limit) || 8));
  const visible = items.slice(0, limit);

  if (visible.length === 0) return null;

  return (
    <div>
      {typeof props.title === "string" && props.title ? (
        <h2 className="mb-4 text-center text-lg font-bold">{props.title}</h2>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((service) => (
          <article
            key={service.id || service.key || service.nameFa}
            className="flex min-w-0 items-start gap-3 rounded-lg border bg-white p-4"
          >
            {service.imageUrl ? (
              <img
                src={service.imageUrl}
                alt=""
                loading="lazy"
                className="size-12 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-xl"
              >
                {service.icon || "⚙"}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{service.nameFa}</h3>
              {service.description ? (
                <p className="mt-1 line-clamp-3 text-xs leading-6 text-muted-foreground">
                  {service.description}
                </p>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
