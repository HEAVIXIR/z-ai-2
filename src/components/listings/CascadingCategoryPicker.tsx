"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export type CategoryPathItem = {
  id: string;
  name: string;
  slug?: string;
  icon?: string | null;
  children?: CategoryPathItem[];
};

type Props = {
  roots: CategoryPathItem[];
  value: string;
  onChange: (id: string, path: CategoryPathItem[]) => void;
};

export default function CascadingCategoryPicker({ roots, value, onChange }: Props) {
  const [path, setPath] = useState<CategoryPathItem[]>([]);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, CategoryPathItem[]>>({});
  const [loadingParent, setLoadingParent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const levels = useMemo(() => {
    const result: CategoryPathItem[][] = [roots];
    for (const parent of path) {
      const children = childrenByParent[parent.id] ?? parent.children ?? [];
      if (children.length === 0) break;
      result.push(children);
    }
    return result;
  }, [roots, path, childrenByParent]);

  const select = async (node: CategoryPathItem, level: number) => {
    const currentRequest = ++requestId.current;
    setLoadingParent(null);
    const nextPath = [...path.slice(0, level), node];
    setPath(nextPath);
    setError(null);
    onChange(node.id, nextPath);

    const embedded = node.children;
    if (embedded) {
      setChildrenByParent((current) => ({ ...current, [node.id]: embedded }));
      return;
    }

    if (Object.prototype.hasOwnProperty.call(childrenByParent, node.id)) return;

    setLoadingParent(node.id);
    try {
      const response = await fetch(`/api/taxonomy/categories/${encodeURIComponent(node.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("بارگذاری زیر‌دسته‌ها ناموفق بود.");
      const payload = await response.json() as {
        category?: { children?: CategoryPathItem[] };
      };
      if (currentRequest !== requestId.current) return;
      setChildrenByParent((current) => ({
        ...current,
        [node.id]: payload.category?.children ?? [],
      }));
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(cause instanceof Error ? cause.message : "خطا در دریافت دسته‌بندی‌ها");
      }
    } finally {
      if (currentRequest === requestId.current) setLoadingParent(null);
    }
  };

  const selectedPath = path.map((item) => item.name).join(" / ");

  return (
    <div className="space-y-5">
      {levels.map((options, level) => {
        const selectedId = path[level]?.id ?? "";
        const title = level === 0 ? "دسته اصلی" : `سطح ${level + 1} دسته‌بندی`;
        return (
          <section key={level} className={level > 0 ? "border-t border-white/10 pt-5" : ""}>
            <label className="mb-2 block text-xs font-bold text-white/60">{title}</label>
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void select(option, level)}
                  aria-pressed={selectedId === option.id}
                  className={`rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
                    selectedId === option.id
                      ? "border-[#F58220] bg-[#F58220]/15 text-[#F58220]"
                      : "border-white/10 bg-black/30 text-white/65 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {level === 0 && option.icon ? <span className="ml-1">{option.icon}</span> : null}
                  {option.name}
                </button>
              ))}
            </div>
            {loadingParent && path[level]?.id === loadingParent && (
              <p className="mt-2 flex items-center gap-2 text-xs text-white/45">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                در حال دریافت سطح بعدی…
              </p>
            )}
          </section>
        );
      })}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3 text-xs text-red-300">
          {error}
        </p>
      )}

      {value && (
        <div className="rounded-xl border border-[#F58220]/20 bg-[#F58220]/[0.04] p-3 text-[11px] text-white/60">
          مسیر انتخاب‌شده: <span className="font-bold text-[#F58220]">{selectedPath}</span>
        </div>
      )}
    </div>
  );
}
