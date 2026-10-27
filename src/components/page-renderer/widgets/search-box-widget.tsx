'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';

type SearchMode = 'SALE' | 'RENT' | 'FEATURED';

export default function SearchBoxWidget({ props }: { props: Record<string, any>; data?: any }) {
  const [mode, setMode] = useState<SearchMode>('SALE');

  return (
    <section className="relative z-20 mx-auto -mt-16 w-full max-w-[1200px] px-4 pb-8 md:-mt-20 md:px-6">
      <div className="rounded-[28px] border border-white/10 bg-[#151515]/95 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-white/65">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>جستجو در بازار هویکس</span>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-black/40 p-1" role="group" aria-label="نوع آگهی">
            {([
              ['SALE', 'خرید'],
              ['RENT', 'اجاره'],
              ['FEATURED', 'فروش ویژه'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={mode === value
                  ? 'rounded-full bg-[#F58220] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#F58220]/20'
                  : 'rounded-full px-4 py-2 text-xs font-bold text-white/55 transition hover:bg-white/5 hover:text-white'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <form action="/listings" method="get" className="flex flex-col gap-3 md:flex-row">
          {mode !== 'FEATURED' && <input type="hidden" name="transaction" value={mode} />}
          {mode === 'FEATURED' && <input type="hidden" name="featured" value="true" />}
          <label className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 transition focus-within:border-[#F58220]/60">
            <Search className="h-5 w-5 shrink-0 text-white/35" aria-hidden="true" />
            <input
              type="search"
              name="q"
              placeholder={String(props.placeholder || 'نام مدل، برند یا توضیحات... مانند PC220')}
              className="h-full min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/30"
              aria-label="جستجوی آگهی‌ها"
            />
          </label>
          {props.showFilters !== false && (
            <Link
              href="/listings"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 text-sm font-bold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              فیلتر
            </Link>
          )}
          <button
            type="submit"
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#F58220] px-8 text-sm font-black text-white transition hover:bg-[#ff8c38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F58220]"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            جستجو
          </button>
        </form>
      </div>
    </section>
  );
}
