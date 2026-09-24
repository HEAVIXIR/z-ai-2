'use client';
export default function SearchBoxWidget({ props }: { props: Record<string, unknown>; data?: unknown }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex gap-2 rounded-lg border bg-white p-2 shadow-sm">
        <input type="text" placeholder={String(props.placeholder || 'جستجو...')} className="flex-1 border-0 text-sm outline-none" />
        <button className="rounded-md bg-[#F58220] px-4 py-1.5 text-sm font-medium text-white">جستجو</button>
      </div>
      {props.showFilters && <div className="mt-2 flex gap-2 text-xs"><span className="rounded-full bg-muted px-3 py-1">دسته</span><span className="rounded-full bg-muted px-3 py-1">برند</span></div>}
    </div>
  );
}
