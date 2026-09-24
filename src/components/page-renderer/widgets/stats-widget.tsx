'use client';
export default function StatsWidget({ props, data }: { props: Record<string, any>; data?: any }) {
  const stats = (data as Record<string, any>) || {};
  const items = Object.entries(stats).filter(([k]) => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt');
  return (
    <div>
      {props.title && <h2 className="mb-3 text-center text-lg font-bold">{props.title}</h2>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.slice(0, 4).map(([key, val]) => (
          <div key={key} className="rounded-lg border bg-white p-4 text-center">
            <p className="text-2xl font-bold text-[#F58220]">{String(val)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{key}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
