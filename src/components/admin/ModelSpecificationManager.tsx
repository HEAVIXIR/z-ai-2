"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Save, Settings2 } from "lucide-react";

type CategoryOption = { id: string; name: string; slug?: string };
type AttributeOption = {
  id: string;
  key?: string | null;
  labelFa: string;
  labelEn?: string | null;
  type: string;
  unit?: string | null;
  required?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  displayOrder?: number;
};
type Override = {
  attributeId: string;
  required: boolean;
  filterable: boolean;
  searchable: boolean;
  sortable: boolean;
  displayOrder: number;
};

export default function ModelSpecificationManager({
  modelId,
  modelName,
  categories,
}: {
  modelId: string;
  modelName: string;
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [available, setAvailable] = useState<AttributeOption[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const overrideMap = useMemo(
    () => new Map(overrides.map((item) => [item.attributeId, item])),
    [overrides],
  );

  useEffect(() => {
    if (!open || !categoryId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setSaved(false);

    (async () => {
      try {
        const [catalogResponse, overrideResponse] = await Promise.all([
          fetch(
            `/api/categories/${encodeURIComponent(categoryId)}/attributes?modelId=${encodeURIComponent(modelId)}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/admin/models/${encodeURIComponent(modelId)}/attributes?categoryId=${encodeURIComponent(categoryId)}`,
            { cache: "no-store" },
          ),
        ]);
        const [catalogData, overrideData] = await Promise.all([
          catalogResponse.json(),
          overrideResponse.json(),
        ]);
        if (!catalogResponse.ok) throw new Error(catalogData?.error ?? "بارگذاری کاتالوگ ویژگی‌ها ناموفق بود.");
        if (!overrideResponse.ok) throw new Error(overrideData?.error ?? "بارگذاری تنظیمات مدل ناموفق بود.");
        if (!alive) return;

        setAvailable(Array.isArray(catalogData?.attributes) ? catalogData.attributes : []);
        setOverrides(
          (overrideData?.attributes ?? []).map((row: any) => ({
            attributeId: row.attributeId,
            required: !!row.required,
            filterable: !!row.filterable,
            searchable: !!row.searchable,
            sortable: !!row.sortable,
            displayOrder: Number(row.displayOrder) || 0,
          })),
        );
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "خطا در دریافت فرم مدل");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, categoryId, modelId]);

  const toggleOverride = (attribute: AttributeOption, enabled: boolean) => {
    setOverrides((current) => {
      if (!enabled) return current.filter((item) => item.attributeId !== attribute.id);
      if (current.some((item) => item.attributeId === attribute.id)) return current;
      return [
        ...current,
        {
          attributeId: attribute.id,
          required: !!attribute.required,
          filterable: !!attribute.filterable,
          searchable: !!attribute.searchable,
          sortable: !!attribute.sortable,
          displayOrder: Number(attribute.displayOrder) || current.length,
        },
      ];
    });
  };

  const updateOverride = (attributeId: string, patch: Partial<Override>) => {
    setOverrides((current) =>
      current.map((item) => item.attributeId === attributeId ? { ...item, ...patch } : item),
    );
  };

  const save = async () => {
    if (!categoryId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}/attributes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, attributes: overrides }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "ذخیره فرم اختصاصی مدل ناموفق بود.");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ذخیره فرم مدل ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-zinc-200 pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 text-xs font-bold text-[#C66A13] hover:text-[#F58220]"
      >
        <Settings2 className="h-3.5 w-3.5" />
        مدیریت فرم فنی اختصاصی مدل
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
          {categories.length > 1 && (
            <div>
              <label className="mb-1 block text-[11px] font-bold text-zinc-500">دسته‌بندی مدل</label>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-800"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
          )}

          <p className="text-[11px] leading-5 text-zinc-500">
            فرم پایه از دسته‌بندی و نوع دستگاه به ارث می‌رسد. فقط ویژگی‌هایی را انتخاب کنید که برای مدل «{modelName}» باید تنظیم اختصاصی داشته باشند؛ بقیه از فرم دسته‌بندی پیروی می‌کنند.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری ویژگی‌ها…
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {available.map((attribute) => {
                const override = overrideMap.get(attribute.id);
                return (
                  <div key={attribute.id} className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!override}
                        onChange={(event) => toggleOverride(attribute, event.target.checked)}
                        className="h-4 w-4 accent-[#F58220]"
                      />
                      <span className="text-xs font-bold text-zinc-800">{attribute.labelFa}</span>
                      <span className="mr-auto text-[10px] text-zinc-400" dir="ltr">{attribute.key ?? attribute.type}{attribute.unit ? ` · ${attribute.unit}` : ""}</span>
                    </label>
                    {override && (
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-200 pt-2">
                        {([
                          ["required", "الزامی"],
                          ["filterable", "فیلترپذیر"],
                          ["searchable", "جست‌وجوپذیر"],
                          ["sortable", "مرتب‌سازی"],
                        ] as const).map(([key, label]) => (
                          <label key={key} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600">
                            <input
                              type="checkbox"
                              checked={override[key]}
                              onChange={(event) => updateOverride(attribute.id, { [key]: event.target.checked })}
                              className="h-3.5 w-3.5 accent-[#F58220]"
                            />
                            {label}
                          </label>
                        ))}
                        <label className="inline-flex items-center gap-2 text-[10px] text-zinc-600">
                          ترتیب
                          <input
                            type="number"
                            min={0}
                            value={override.displayOrder}
                            onChange={(event) => updateOverride(attribute.id, { displayOrder: Math.max(0, Number(event.target.value) || 0) })}
                            className="h-7 w-16 rounded border border-zinc-200 bg-white px-2 text-center"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
              {available.length === 0 && (
                <p className="py-4 text-center text-xs text-zinc-400">برای این دسته ویژگی‌ای ثبت نشده است. ابتدا کاتالوگ ویژگی‌های دسته را تکمیل کنید.</p>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          {saved && <p className="text-xs font-bold text-emerald-700">تنظیمات اختصاصی مدل ذخیره شد.</p>}

          <div className="flex items-center justify-between border-t border-zinc-200 pt-3">
            <span className="text-[10px] text-zinc-400">{overrides.length} ویژگی اختصاصی</span>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading || !categoryId}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#F58220] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              ذخیره فرم مدل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
