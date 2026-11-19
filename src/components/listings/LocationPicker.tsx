"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

/* ============================================================
   LocationPicker — cascading country / province / city dropdowns.

   Fetches from /api/locations:
   - GET /api/locations                       → countries
   - GET /api/locations?country=<code|id>     → provinces
   - GET /api/locations?province=<id>         → cities

   Default country = ایران (IR). When the parent doesn't supply a
   countryId, we auto-select Iran once the country list loads.
   ============================================================ */

export type LocationValue = {
  countryId: string;
  provinceId: string;
  cityId: string;
  // P0-B: resolved display names for the review screen. Populated by
  // the LocationPicker when the user selects a country/province/city,
  // so the wizard's Step 7 review can show human-readable names instead
  // of raw cuid IDs.
  countryLabel?: string;
  provinceLabel?: string;
  cityLabel?: string;
};

type Country = { id: string; name: string; nameEn: string | null; code: string | null };
type Province = { id: string; name: string; nameEn: string | null; code: string | null; countryId: string };
type City = { id: string; name: string; nameEn: string | null; provinceId: string };

const selectCls =
  "h-11 w-full rounded-xl border border-white/10 bg-black/50 px-3 text-sm text-white outline-none transition focus:border-[#F58220] focus:shadow-[0_0_0_3px_rgba(245,130,32,.12)]";
const labelCls = "mb-1.5 block text-xs font-bold text-white/60";

export default function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
}) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [countryError, setCountryError] = useState(false);
  const [provinceError, setProvinceError] = useState(false);
  const [cityError, setCityError] = useState(false);
  const [countryRetry, setCountryRetry] = useState(0);
  const [provinceRetry, setProvinceRetry] = useState(0);
  const [cityRetry, setCityRetry] = useState(0);

  // 1) Load country list (default to ایران)
  useEffect(() => {
    let alive = true;
    setLoadingCountries(true);
    setCountryError(false);
    (async () => {
      try {
        const res = await fetch("/api/locations", { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { countries: Country[] };
        if (!alive) return;
        const countryList = data.countries ?? [];
        setCountries(countryList);
        if (countryList.length === 0) {
          setCountryError(true);
          return;
        }
        if (!value.countryId && countryList.length > 0) {
          const iran =
            countryList.find((c) => c.code === "IR" || c.name === "ایران") ??
            countryList[0];
          onChange({ ...value, countryId: iran.id, provinceId: "", cityId: "", countryLabel: iran.name, provinceLabel: undefined, cityLabel: undefined });
        }
      } catch {
        if (alive) setCountryError(true);
      } finally {
        if (alive) setLoadingCountries(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [countryRetry]);

  // 2) Load provinces when country changes
  useEffect(() => {
    if (!value.countryId) {
      setProvinces([]);
      setCities([]);
      setLoadingProvinces(false);
      setLoadingCities(false);
      setProvinceError(false);
      setCityError(false);
      return;
    }
    let alive = true;
    setProvinceError(false);
    setLoadingProvinces(true);
    (async () => {
      try {
        const country = countries.find((c) => c.id === value.countryId);
        const code = country?.code ?? country?.name ?? value.countryId;
        const res = await fetch(`/api/locations?country=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { provinces: Province[] };
        if (!alive) return;
        setProvinces(data.provinces ?? []);
        if ((data.provinces ?? []).length === 0) setProvinceError(true);
        // If the current provinceId is no longer valid, clear it
        if (value.provinceId && !(data.provinces ?? []).some((p) => p.id === value.provinceId)) {
          onChange({ ...value, provinceId: "", cityId: "", provinceLabel: undefined, cityLabel: undefined });
        }
      } catch {
        if (alive) {
          setProvinces([]);
          setProvinceError(true);
        }
      } finally {
        if (alive) setLoadingProvinces(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [value.countryId, countryRetry, provinceRetry]);

  // 3) Load cities when province changes
  useEffect(() => {
    if (!value.provinceId) {
      setCities([]);
      setLoadingCities(false);
      setCityError(false);
      return;
    }
    let alive = true;
    setCityError(false);
    setLoadingCities(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/locations?province=${encodeURIComponent(value.provinceId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { cities: City[] };
        if (!alive) return;
        setCities(data.cities ?? []);
        if ((data.cities ?? []).length === 0) setCityError(true);
        if (value.cityId && !(data.cities ?? []).some((c) => c.id === value.cityId)) {
          onChange({ ...value, cityId: "", cityLabel: undefined });
        }
      } catch {
        if (alive) {
          setCities([]);
          setCityError(true);
        }
      } finally {
        if (alive) setLoadingCities(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [value.provinceId, cityRetry]);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* Country */}
      <div>
        <label className={labelCls}>
          <MapPin className="ml-1 inline h-3 w-3 text-[#F58220]" />
          کشور
        </label>
        <div className="relative">
          <select
            value={value.countryId}
            onChange={(e) => {
              const selected = countries.find((c) => c.id === e.target.value);
              onChange({ countryId: e.target.value, provinceId: "", cityId: "", countryLabel: selected?.name, provinceLabel: undefined, cityLabel: undefined });
            }}
            className={selectCls}
            disabled={loadingCountries}
          >
            <option value="">
              {loadingCountries ? "بارگذاری…" : "انتخاب کنید"}
            </option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {loadingCountries && (
            <Loader2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[#F58220]" />
          )}
        </div>
        {countryError && (
          <p role="alert" className="mt-2 text-xs text-red-300">
            فهرست کشورها دریافت نشد یا هنوز داده‌ای در آن ثبت نشده است.
            <button type="button" onClick={() => setCountryRetry((current) => current + 1)} className="mr-2 underline">تلاش مجدد</button>
          </p>
        )}
      </div>

      {/* Province */}
      <div>
        <label className={labelCls}>استان</label>
        <div className="relative">
          <select
            value={value.provinceId}
            onChange={(e) => {
              const selected = provinces.find((p) => p.id === e.target.value);
              onChange({
                countryId: value.countryId,
                countryLabel: value.countryLabel,
                provinceId: e.target.value,
                provinceLabel: selected?.name,
                cityId: "",
                cityLabel: undefined,
              });
            }}
            className={selectCls}
            disabled={loadingProvinces || !value.countryId}
          >
            <option value="">
              {!value.countryId
                ? "ابتدا کشور را انتخاب کنید"
                : loadingProvinces
                  ? "بارگذاری…"
                  : "انتخاب کنید"}
            </option>
            {provinces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {loadingProvinces && (
            <Loader2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[#F58220]" />
          )}
        </div>
        {provinceError && (
          <p role="alert" className="mt-2 text-xs text-red-300">
            فهرست استان‌های این کشور دریافت نشد یا خالی است.
            <button type="button" onClick={() => setProvinceRetry((current) => current + 1)} className="mr-2 underline">تلاش مجدد</button>
          </p>
        )}
      </div>

      {/* City */}
      <div>
        <label className={labelCls}>شهر</label>
        <div className="relative">
          <select
            value={value.cityId}
            onChange={(e) => {
              const selected = cities.find((c) => c.id === e.target.value);
              onChange({
                countryId: value.countryId,
                countryLabel: value.countryLabel,
                provinceId: value.provinceId,
                provinceLabel: value.provinceLabel,
                cityId: e.target.value,
                cityLabel: selected?.name,
              });
            }}
            className={selectCls}
            disabled={loadingCities || !value.provinceId}
          >
            <option value="">
              {!value.provinceId
                ? "ابتدا استان را انتخاب کنید"
                : loadingCities
                  ? "بارگذاری…"
                  : "انتخاب کنید"}
            </option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {loadingCities && (
            <Loader2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[#F58220]" />
          )}
        </div>
        {cityError && (
          <p role="alert" className="mt-2 text-xs text-red-300">
            فهرست شهرهای این استان دریافت نشد یا خالی است.
            <button type="button" onClick={() => setCityRetry((current) => current + 1)} className="mr-2 underline">تلاش مجدد</button>
          </p>
        )}
      </div>
    </div>
  );
}
