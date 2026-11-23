"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ListingImageUploader from "@/components/listings/ListingImageUploader";
import CascadingCategoryPicker, { type CategoryPathItem } from "@/components/listings/CascadingCategoryPicker";
import TransactionTypePicker from "@/components/listings/TransactionTypePicker";
import LocationPicker, { type LocationValue } from "@/components/listings/LocationPicker";
import AttributeFields, {
  type AttributeValue,
  type AttributeDef,
  buildAttributePayload,
  validateAttributeFields,
  getCachedAttributes,
} from "@/components/listings/AttributeFields";
import { toFa } from "@/lib/format";
import { isRequestTransactionType } from "@/lib/transaction-type-routing";
import { BRAND_STATUS_LABELS } from "@/lib/brand-labels";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  Key,
  Layers3,
  Loader2,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Truck,
  Search,
  Building2,
  MapPin,
  Sliders,
  AlertTriangle,
} from "lucide-react";

/* ============================================================
   /listings/new — HBR Taxonomy V1.1 listing wizard.

   Steps:
   1. نوع معامله (TransactionType)  — SALE/RENT/WANTED/QUOTE/AUCTION/SERVICE_REQUEST/SERVICE_OFFER
   2. دسته‌بندی (Category)          — CATALOG only, cascading root → child → grandchild
   3. اطلاعات پایه                  — title/description; optional brand/model when relevant
   4. مشخصات تخصصی                  — dynamic inherited attributes for selected subject/category
   5. موقعیت (Location)              — country/province/city cascading
   6. جزئیات                          — title, description, price/rental period, images, contact
   7. بازبینی و تأیید                — review + POST /api/listings
   ============================================================ */

const STEP_LABELS = [
  "نوع معامله",
  "دسته‌بندی",
  "اطلاعات پایه",
  "مشخصات تخصصی",
  "موقعیت",
  "جزئیات",
  "تکمیل",
];

// Hard-coded rental periods (used when transactionType === RENT)
const RENTAL_PERIODS = [
  { v: "HOURLY", l: "ساعتی" },
  { v: "DAILY", l: "روزانه" },
  { v: "WEEKLY", l: "هفتگی" },
  { v: "MONTHLY", l: "ماهانه" },
  { v: "PROJECT", l: "پروژه‌ای" },
];

type BrandSuggestion = {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  country: string | null;
  logoUrl: string | null;
  status?: string;
};

type TaxChild = { id: string; name: string; slug: string; icon: string | null };
type TaxRoot = {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  children: TaxChild[];
};

type ServiceTypeOption = { id: string; key: string; nameFa: string; nameEn: string | null };

export default function NewListingPage() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  // P0-B: capture the created listing/request id + slug so the success
  // screen can link to it (previously discarded when mediaStatus !== PENDING).
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attributeWarning, setAttributeWarning] = useState<string | null>(null);
  const [mediaRepairEntityId, setMediaRepairEntityId] = useState<string | null>(null);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [mediaRepairing, setMediaRepairing] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [stagedMediaAssets, setStagedMediaAssets] = useState<Array<{ assetId: string; url: string }>>([]);
  const [imagesUploading, setImagesUploading] = useState(false);
  const handleImagesChange = (nextImages: string[]) => {
    setImages(nextImages);
    setStagedMediaAssets((current) => current.filter((asset) => nextImages.includes(asset.url)));
  };
  const handleStagedAssetsChange = (assets: Array<{ assetId: string; url: string }>) => {
    setStagedMediaAssets((current) => {
      const merged = new Map(current.map((asset) => [asset.assetId, asset]));
      for (const asset of assets) merged.set(asset.assetId, asset);
      return Array.from(merged.values());
    });
  };

  // Form state — V1.1
  // The first step is valid only after an active transaction type is loaded and selected.
  const [transactionType, setTransactionType] = useState<string>("");
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [auction, setAuction] = useState({
    reservePrice: "",
    minIncrement: "",
    startDate: "",
    endDate: "",
  });
  const [rfq, setRfq] = useState({
    quantity: "1",
    budgetMin: "",
    budgetMax: "",
    deadline: "",
    terms: "",
  });
  const [wanted, setWanted] = useState({
    // Demand intent: what the buyer wants to do. SALE = buy (خرید),
    // RENT = rent (اجاره), SALE_AND_RENT = flexible (خرید/اجاره),
    // SERVICE_REQUEST = service demand (خدمات). Stored in
    // BuyRequest.transaction and read by the matching engine to narrow
    // supply candidates to compatible types. Default buy intent matches
    // the historical WANTED behavior.
    intent: "SALE" as "SALE" | "RENT" | "SALE_AND_RENT" | "SERVICE_REQUEST",
    quantity: "1",
    budgetMin: "",
    budgetMax: "",
    deadline: "",
  });
  const [categoryId, setCategoryId] = useState<string>("");
  const [attributes, setAttributes] = useState<AttributeValue>({});
  const [attributeDefs, setAttributeDefs] = useState<AttributeDef[]>([]);
  const [attributesLoaded, setAttributesLoaded] = useState(false);
  const [attrErrors, setAttrErrors] = useState<Record<string, string>>({});
  const [brandId, setBrandId] = useState<string>("");
  const [modelName, setModelName] = useState<string>("");
  const [location, setLocation] = useState<LocationValue>({
    countryId: "",
    provinceId: "",
    cityId: "",
  });
  useEffect(() => {
    if (!["SALE", "RENT", "AUCTION"].includes(transactionType)) {
      setLocation((current) =>
        current.latitude || current.longitude
          ? { ...current, latitude: "", longitude: "" }
          : current,
      );
    }
  }, [transactionType]);
  const [form, setForm] = useState({
    brandLabel: "",
    title: "",
    shortDesc: "",
    description: "",
    condition: "USED",
    year: "",
    hours: "",
    price: "",
    priceType: "NEGOTIABLE",
    rentalPeriod: "",
    serialNumber: "",
    sellerName: "",
    sellerPhone: "",
  });

  // P2-5b — Rental-only fields (used when transactionType=RENT).
  const [rental, setRental] = useState({
    deposit: "",
    minimumRentalPeriod: "",
    operatorIncluded: false,
    fuelIncluded: false,
    transportIncluded: false,
    availabilityStart: "",
    availabilityEnd: "",
  });
  const setRentalField = (k: keyof typeof rental, v: string | boolean) =>
    setRental((r) => ({ ...r, [k]: v }));

  // Catalog root/child/grandchild state
  const [catalogRoots, setCatalogRoots] = useState<TaxRoot[]>([]);
  const [serviceRoots, setServiceRoots] = useState<TaxRoot[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const [taxonomyRetryKey, setTaxonomyRetryKey] = useState(0);
  const [childCats, setChildCats] = useState<TaxChild[]>([]);
  const [grandchildCats, setGrandchildCats] = useState<TaxChild[]>([]);
  const [categoryPath, setCategoryPath] = useState<CategoryPathItem[]>([]);

  // Brand typeahead state (alias-aware, hits /api/brands/search).
  const [brandQuery, setBrandQuery] = useState("");
  const [brandResults, setBrandResults] = useState<BrandSuggestion[]>([]);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [brandRetryKey, setBrandRetryKey] = useState(0);
  const [brandBrowseKey, setBrandBrowseKey] = useState(0);
  const [brandOpen, setBrandOpen] = useState(false);
  const brandAbort = useRef<AbortController | null>(null);
  const brandWrapRef = useRef<HTMLDivElement>(null);


  // ── Fetch V1.1 catalog roots ──
  useEffect(() => {
    let alive = true;
    setTaxonomyLoading(true);
    setTaxonomyError(null);
    (async () => {
      try {
        const res = await fetch("/api/taxonomy", { cache: "no-store" });
        if (!res.ok) throw new Error("taxonomy unavailable");
        const data = (await res.json()) as {
          catalogRoots?: TaxRoot[];
          serviceRoots?: TaxRoot[];
          serviceTypes?: ServiceTypeOption[];
        };
        if (alive) {
          setCatalogRoots(data.catalogRoots ?? []);
          setServiceRoots(data.serviceRoots ?? []);
          setServiceTypes(data.serviceTypes ?? []);
        }
      } catch {
        if (alive) setTaxonomyError("دریافت دسته‌بندی‌ها ناموفق بود. اتصال را بررسی کنید و دوباره تلاش کنید.");
      } finally {
        if (alive) setTaxonomyLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [taxonomyRetryKey]);

  // ── Debounced alias-aware brand search with visible retry state ──
  useEffect(() => {
    const q = brandQuery.trim();
    if (!q && brandBrowseKey === 0) {
      setBrandResults([]);
      setBrandLoading(false);
      setBrandError(null);
      brandAbort.current?.abort();
      return;
    }
    setBrandLoading(true);
    setBrandError(null);
    const t = setTimeout(async () => {
      brandAbort.current?.abort();
      const ctrl = new AbortController();
      brandAbort.current = ctrl;
      try {
        const searchUrl = q
          ? `/api/brands/search?q=${encodeURIComponent(q)}`
          : "/api/brands/search";
        const res = await fetch(searchUrl, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("brand search failed");
        const data = (await res.json()) as { brands: BrandSuggestion[] };
        if (ctrl.signal.aborted) return;
        setBrandResults(data.brands ?? []);
        setBrandOpen(true);
      } catch {
        if (!ctrl.signal.aborted) {
          setBrandResults([]);
          setBrandOpen(false);
          setBrandError("جستجوی برند انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.");
        }
      } finally {
        if (!ctrl.signal.aborted) setBrandLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      brandAbort.current?.abort();
    };
  }, [brandQuery, brandRetryKey, brandBrowseKey]);

  // ── Close brand dropdown on outside click ──
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (brandWrapRef.current && !brandWrapRef.current.contains(e.target as Node)) {
        brandAbort.current?.abort();
        setBrandLoading(false);
        setBrandOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pickBrand = (b: BrandSuggestion) => {
    setBrandId(b.id);
    setBrandBrowseKey(0);
    setBrandQuery(b.name);
    setForm((f) => ({ ...f, brandLabel: b.name }));
    setBrandOpen(false);
    setModelName("");
    setAttributes({});
    setAttributeDefs([]);
    setAttributesLoaded(false);
    setAttrErrors({});
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const isRent = transactionType === "RENT";
  const isAuction = transactionType === "AUCTION";
  const isServiceRequest = transactionType === "SERVICE_REQUEST";
  const isServiceOffer = transactionType === "SERVICE_OFFER";
  // When the wizard's WANTED flow picks intent=SERVICE_REQUEST, the demand
  // is a service demand and must use the SERVICE taxonomy (serviceRoots),
  // service-type fields, and service-step labels — NOT the marketplace
  // roots that the WANTED listing-type label would otherwise select.
  const isWantedServiceRequest = transactionType === "WANTED" && wanted.intent === "SERVICE_REQUEST";
  const isServiceFlow = isServiceRequest || isServiceOffer || isWantedServiceRequest;
  const isRequestFlow = isRequestTransactionType(transactionType);
  // Category identifies the underlying asset/service; SALE, RENT, AUCTION and WANTED are transaction intents.
  // Therefore every non-service flow selects from the canonical CATALOG tree, never the empty/vertical RENT root.
  const categoryRoots = isServiceFlow ? serviceRoots : catalogRoots;

  // P0 #1: when the WANTED intent changes, the category taxonomy may
  // change (SERVICE_REQUEST → serviceRoots; buy/rent intent → catalogRoots).
  // If the user already picked a category at Step 2 with a different
  // intent, the category is now mismatched. Clear categoryId + related
  // state so the user re-selects with the correct taxonomy roots.
  const handleWantedIntentChange = (nextIntent: "SALE" | "RENT" | "SALE_AND_RENT" | "SERVICE_REQUEST") => {
    if (wanted.intent === nextIntent) return;
    setWanted((v) => ({ ...v, intent: nextIntent }));
    // Only clear if a category was already chosen (avoid spurious clears
    // when the user is just toggling before selecting a category).
    if (categoryId || categoryPath.length > 0) {
      setCategoryId("");
      setCategoryPath([]);
      setBrandId("");
      setBrandQuery("");
      setBrandBrowseKey(0);
      setBrandResults([]);
      setBrandOpen(false);
      setModelName("");
      setForm((f) => ({ ...f, brandLabel: "" }));
        setAttributes({});
      setAttributeDefs([]);
      setAttributesLoaded(false);
      setAttrErrors({});
    }
  };

  const handleTransactionTypeChange = (nextType: string) => {
    if (nextType === transactionType) return;
    setTransactionType(nextType);
    setServiceTypeId("");
    setAuction({ reservePrice: "", minIncrement: "", startDate: "", endDate: "" });
    setRfq({ quantity: "1", budgetMin: "", budgetMax: "", deadline: "", terms: "" });
    setWanted({ intent: "SALE", quantity: "1", budgetMin: "", budgetMax: "", deadline: "" });
    setCategoryId("");
    setCategoryPath([]);
    setBrandId("");
    setBrandQuery("");
    setBrandBrowseKey(0);
    setBrandResults([]);
    setBrandOpen(false);
    setModelName("");
    setAttributes({});
    setAttributeDefs([]);
    setAttributesLoaded(false);
    setAttrErrors({});
    // P1 #4-#7: clear transaction-type-specific state that leaked across
    // switches. Images, rental fields, form fields, and transient UI flags
    // must not persist when the user picks a different transaction type.
    setImages([]);
    setStagedMediaAssets([]);
    setImagesUploading(false);
    setRental({ deposit: "", minimumRentalPeriod: "", operatorIncluded: false, fuelIncluded: false, transportIncluded: false, availabilityStart: "", availabilityEnd: "" });
    setForm({ brandLabel: "", title: "", shortDesc: "", description: "", condition: "USED", year: "", hours: "", price: "", priceType: "NEGOTIABLE", rentalPeriod: "", serialNumber: "", sellerName: "", sellerPhone: "" });
    setSubmitError(null);
    setAttributeWarning(null);
    setMediaWarning(null);
    setMediaRepairEntityId(null);
    setSubmitting(false);
    setCreatedId(null);
    setCreatedSlug(null);
  };

  const canProceed = () => {
    if (step === 1) {
      // P0-A: for WANTED, the intent MUST be selected at Step 1 before the
      // user can proceed to Step 2 (category). The intent determines which
      // taxonomy roots are shown (serviceRoots vs marketplaceRoots).
      if (transactionType === "WANTED" && !wanted.intent) return false;
      return Boolean(transactionType);
    }
    if (step === 2) return Boolean(categoryId);
    if (step === 3) return form.title.trim().length >= 5 && form.shortDesc.trim();
    if (step === 4) {
      // Category-specific attributes are loaded before the user can continue; brand/model are optional.
      // NOTE: do NOT call setAttrErrors here — canProceed runs during render.
      const errs = validateAttributeFields(attributeDefs, attributes);
      // Fail closed: a selected category without a resolved technical form
      // must never pass review as if its specifications were complete.
      return attributesLoaded && Object.keys(errs).length === 0;
    }
    if (step === 5) {
      if (!location.provinceId) return false;
      if (!["SALE", "RENT", "AUCTION"].includes(transactionType)) return true;
      const hasLatitude = Boolean(location.latitude?.trim());
      const hasLongitude = Boolean(location.longitude?.trim());
      if (hasLatitude !== hasLongitude) return false;
      if (!hasLatitude) return true;
      const latitude = Number(location.latitude);
      const longitude = Number(location.longitude);
      return Boolean(
        location.cityId &&
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180
      );
    }
    if (step === 6) {
      if (imagesUploading) return false;
      if (isServiceFlow) {
        // H.2.3 (P1 fix): WANTED + intent=SERVICE_REQUEST is a service-flow
        // demand, but it MUST still satisfy the WANTED quantity / budget /
        // deadline checks. Previously the `isServiceFlow` branch short-
        // circuited to `Boolean(serviceTypeId)` and never reached the
        // WANTED-specific block below, so a buyer could advance to the
        // review step with an inverted/negative budget or an expired
        // deadline. The server is the safety net, but the wizard must fail
        // closed at the step that collects those fields.
        if (!serviceTypeId) return false;
        if (isWantedServiceRequest || isServiceRequest) {
          const wq = Number(wanted.quantity);
          const wmin = wanted.budgetMin ? BigInt(wanted.budgetMin.replace(/[^\d]/g, "")) : null;
          const wmax = wanted.budgetMax ? BigInt(wanted.budgetMax.replace(/[^\d]/g, "")) : null;
          const exactPrice = form.price.trim();
          const hasExactPrice = exactPrice.length > 0;
          const exactPriceValid = !hasExactPrice || /^\d+$/.test(exactPrice);
          const exactPriceConflictsWithRange = hasExactPrice && (wmin !== null || wmax !== null);
          const wdeadline = wanted.deadline ? new Date(`${wanted.deadline}T23:59:00`) : null;
          return Number.isInteger(wq) && wq >= 1 && wq <= 10000 &&
            (wmin === null || wmin >= 0n) &&
            (wmax === null || wmax >= 0n) &&
            (wmin === null || wmax === null || wmin <= wmax) &&
            exactPriceValid &&
            !exactPriceConflictsWithRange &&
            (!wdeadline || (!Number.isNaN(wdeadline.getTime()) && wdeadline.getTime() > Date.now()));
        }
        return true;
      }
      if (transactionType === "QUOTE") {
        const quantity = Number(rfq.quantity);
        const min = rfq.budgetMin ? BigInt(rfq.budgetMin.replace(/[^\d]/g, "")) : null;
        const max = rfq.budgetMax ? BigInt(rfq.budgetMax.replace(/[^\d]/g, "")) : null;
        return Number.isInteger(quantity) && quantity >= 1 && quantity <= 10000 &&
          (min === null || min >= 0n) &&
          (max === null || max >= 0n) &&
          (min === null || max === null || min <= max);
      }
      if (transactionType === "WANTED") {
        const quantity = Number(wanted.quantity);
        const min = wanted.budgetMin ? BigInt(wanted.budgetMin.replace(/[^\d]/g, "")) : null;
        const max = wanted.budgetMax ? BigInt(wanted.budgetMax.replace(/[^\d]/g, "")) : null;
        const exactPrice = form.price.trim();
        const hasExactPrice = exactPrice.length > 0;
        const exactPriceValid = !hasExactPrice || /^\d+$/.test(exactPrice);
        const exactPriceConflictsWithRange = hasExactPrice && (min !== null || max !== null);
        const deadline = wanted.deadline ? new Date(`${wanted.deadline}T23:59:00`) : null;
        return Number.isInteger(quantity) && quantity >= 1 && quantity <= 10000 &&
          (min === null || min >= 0n) &&
          (max === null || max >= 0n) &&
          (min === null || max === null || min <= max) &&
          exactPriceValid &&
          !exactPriceConflictsWithRange &&
          (!deadline || (!Number.isNaN(deadline.getTime()) && deadline.getTime() > Date.now()));
      }
      if (isRequestFlow) return true;
      if (isRent) {
        // P1 fix (H.2.4d): treat price "0" / non-digit as invalid client-side
        // (previously the string "0" was truthy and passed gating, only to be
        // rejected by the server at submit time).
        const rentPriceOk = Boolean(form.price) && /^\d+$/.test(String(form.price).replace(/[^\d]/g, "")) && BigInt(String(form.price).replace(/[^\d]/g, "") || "0") > 0n;
        return Boolean(rentPriceOk && form.rentalPeriod && images.length >= 1);
      }
      if (isAuction) {
        // H.2.4d (P1 fix): mirror the server-side auction sanity checks
        // client-side (startPrice>0, minIncrement>0, reservePrice>=startPrice,
        // endDate>startDate, startDate not far in the past) so the user gets
        // inline feedback instead of a submit-time 400.
        if (!(form.price && auction.minIncrement && auction.startDate && auction.endDate && images.length >= 1)) return false;
        const startPrice = BigInt(String(form.price).replace(/[^\d]/g, "") || "0");
        const minInc = BigInt(String(auction.minIncrement).replace(/[^\d]/g, "") || "0");
        if (startPrice <= 0n || minInc <= 0n) return false;
        if (auction.reservePrice) {
          const reserve = BigInt(String(auction.reservePrice).replace(/[^\d]/g, "") || "0");
          if (reserve < startPrice) return false;
        }
        const s = new Date(auction.startDate);
        const e = new Date(auction.endDate);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
        if (e.getTime() <= s.getTime()) return false;
        // Allow up to 5 min clock skew (server allows 60s; be lenient here).
        if (s.getTime() < Date.now() - 5 * 60 * 1000) return false;
        return true;
      }
      // SALE (default): price must be a positive integer string ("0" is not
      // a valid price). See H.2.4d for the rationale.
      const salePriceOk = Boolean(form.price) && /^\d+$/.test(String(form.price).replace(/[^\d]/g, "")) && BigInt(String(form.price).replace(/[^\d]/g, "") || "0") > 0n;
      return Boolean(salePriceOk && images.length >= 1);
    }
    return true;
  };

  const next = () => canProceed() && setStep((s) => Math.min(7, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  // H.2.4e: stable idempotency key for the current submission attempt.
  // Generated lazily on first submit and reused on retry so the server
  // resolves a network-blip resubmission to the prior result instead of
  // creating a duplicate. Cleared on definitive success so the next
  // (separate) submission gets a fresh key. A 400/validation failure does
  // NOT clear the key — but no audit row was written, so the next attempt
  // is still a fresh create (findIdempotentResult returns null).
  const idempotencyKeyRef = useRef<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setAttributeWarning(null);
    setSubmitting(true);
    try {
      // Build the typed attribute payload before creating the listing. The
      // server validates and persists it in the same transaction as the listing.
      const defs = attributeDefs.length > 0
        ? attributeDefs
        : (categoryId ? getCachedAttributes(categoryId, null) ?? [] : []);
      const attributePayload = buildAttributePayload(defs, attributes);

      // Location IDs are resolved and validated server-side.
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        shortDesc: form.shortDesc.trim() || undefined,
        condition: form.condition,
        year: form.year ? Number(form.year) : undefined,
        workingHours: form.hours ? Number(form.hours) : undefined,
        price: form.price ? String(form.price).replace(/[^\d]/g, "") : undefined,
        priceType: isAuction ? "AUCTION" : form.priceType,
        // Map V1.1 TransactionType.key → legacy Listing.listingType
        // (server stores listingType as String; we keep the key for compatibility).
        listingType: transactionType,
        transactionType,
        rentalPeriod: isRent ? form.rentalPeriod : undefined,
        province: location.provinceId || undefined,
        city: location.cityId || undefined,
        countryId: location.countryId || undefined,
        provinceId: location.provinceId || undefined,
        cityId: location.cityId || undefined,
        locationLatitude: ["SALE", "RENT", "AUCTION"].includes(transactionType) && location.latitude?.trim() ? Number(location.latitude) : undefined,
        locationLongitude: ["SALE", "RENT", "AUCTION"].includes(transactionType) && location.longitude?.trim() ? Number(location.longitude) : undefined,
        brandId: brandId || undefined,
        categoryId: categoryId || undefined,
        modelName: modelName.trim() || undefined,
        serialNumber: form.serialNumber || undefined,
        sellerName: form.sellerName || undefined,
        sellerPhone: form.sellerPhone || undefined,
        serviceTypeId: isServiceFlow ? serviceTypeId : undefined,
        attributeValues: attributePayload,
        // Demand media is canonicalized by staged asset IDs, not client-provided URLs; isolated acceptance runs are commit-marker gated.
        images: transactionType === "WANTED" || transactionType === "SERVICE_REQUEST" ? undefined : images.map((url) => ({ url })),
      };


      const isDemandSubmission = transactionType === "WANTED" || transactionType === "SERVICE_REQUEST";
      if (isDemandSubmission) {
        // Demand media is persisted from the server-owned staging manifest;
        // never send client URLs as the canonical BuyRequest image record.
        body.assetIds = stagedMediaAssets.map((asset) => asset.assetId);
        // BuyRequest has one canonical description field; preserve the wizard summary too.
        body.description = [form.shortDesc.trim(), form.description.trim()].filter(Boolean).join("\n\n") || undefined;
        body.listingType = "WANTED";
        body.transactionType = "WANTED";
        body.intent = transactionType === "SERVICE_REQUEST" ? "SERVICE_REQUEST" : wanted.intent;
        body.quantity = Number(wanted.quantity);
        body.budgetMin = wanted.budgetMin || undefined;
        body.budgetMax = wanted.budgetMax || undefined;
        body.deadline = wanted.deadline
          ? new Date(`${wanted.deadline}T23:59:00`).toISOString()
          : undefined;
      }
      if (transactionType === "QUOTE") {
        body.rfq = {
          quantity: Number(rfq.quantity),
          budgetMin: rfq.budgetMin || undefined,
          budgetMax: rfq.budgetMax || undefined,
          deadline: rfq.deadline ? new Date(`${rfq.deadline}T23:59:00`).toISOString() : undefined,
          terms: rfq.terms.trim() || undefined,
        };
      }
      if (isAuction) {
        body.auction = {
          startPrice: form.price.replace(/[^\d]/g, ""),
          reservePrice: auction.reservePrice || undefined,
          minIncrement: auction.minIncrement,
          startDate: new Date(auction.startDate).toISOString(),
          endDate: new Date(auction.endDate).toISOString(),
        };
      }

      // P2-5b — Rental fields (sent only when transactionType=RENT).
      if (isRent) {
        body.deposit = rental.deposit ? rental.deposit.replace(/[^\d]/g, "") : undefined;
        body.minimumRentalPeriod = rental.minimumRentalPeriod || undefined;
        body.operatorIncluded = rental.operatorIncluded;
        body.fuelIncluded = rental.fuelIncluded;
        body.transportIncluded = rental.transportIncluded;
        body.availabilityStart = rental.availabilityStart || undefined;
        body.availabilityEnd = rental.availabilityEnd || undefined;
      }

      const endpoint = isDemandSubmission ? "/api/wanted" : "/api/listings";
      // Generate (or reuse) the idempotency key for this submission.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data.ok || data.success)) {
        setSubmitError(data.error ?? "ثبت آگهی ناموفق بود. لطفاً دوباره تلاش کنید.");
        return;
      }

      if (data.mediaStatus === "PENDING" && data.id) {
        setMediaRepairEntityId(String(data.id));
        const mediaEntityLabel = isDemandSubmission ? "درخواست" : "آگهی";
        setMediaWarning(
          `${Number(data.mediaPendingCount) || 0} تصویر ثبت شده اما انتقال نهایی آن‌ها کامل نشده است. ${mediaEntityLabel} ذخیره شده است؛ می‌توانید بازیابی تصاویر را دوباره امتحان کنید.`,
        );
      }
      // P0-B: always capture the created id + slug for the success-screen link.
      if (data.id) setCreatedId(String(data.id));
      if (data.slug) setCreatedSlug(String(data.slug));
      // Success is definitive — clear the idempotency key so a future,
      // separate submission cannot accidentally replay this one.
      idempotencyKeyRef.current = null;
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setSubmitError(err?.message ?? "خطای شبکه — اتصال اینترنت را بررسی کنید.");
    } finally {
      setSubmitting(false);
    }
  };

  const retryMediaAttachment = async () => {
    if (!mediaRepairEntityId || mediaRepairing) return;
    setMediaRepairing(true);
    setMediaWarning(null);
    try {
      const isDemandSubmission = transactionType === "WANTED" || transactionType === "SERVICE_REQUEST";
      const mediaRetryPath = isDemandSubmission
        ? `/api/wanted/${encodeURIComponent(mediaRepairEntityId)}/media`
        : `/api/listings/${encodeURIComponent(mediaRepairEntityId)}/media`;
      const response = await fetch(mediaRetryPath, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) {
        throw new Error(result.error ?? "بازیابی تصاویر ناموفق بود.");
      }
      if (Number(result.pendingCount) > 0) {
        const mediaEntityLabel = isDemandSubmission ? "درخواست" : "آگهی";
        setMediaWarning(
          `${result.pendingCount} تصویر هنوز منتقل نشده است. بعداً دوباره تلاش کنید؛ ${mediaEntityLabel} شما ذخیره شده است.`,
        );
      } else {
        const mediaEntityLabel = isDemandSubmission ? "درخواست" : "آگهی";
        setMediaWarning(`همه تصاویر با موفقیت به ${mediaEntityLabel} متصل شدند.`);
        setMediaRepairEntityId(null);
      }
    } catch (error) {
      setMediaWarning(
        error instanceof Error ? error.message : "بازیابی تصاویر با خطا مواجه شد.",
      );
    } finally {
      setMediaRepairing(false);
    }
  };

  const inputCls =
    "h-11 w-full rounded-xl border border-white/10 bg-black/50 px-3 text-sm text-white outline-none transition focus:border-[#F58220] focus:shadow-[0_0_0_3px_rgba(245,130,32,.12)] placeholder:text-white/25";
  const labelCls = "mb-1.5 block text-xs font-bold text-white/60";

  return (
    <div className="site-theme flex min-h-screen flex-col bg-[#0b0b0b]">
      <Header categories={[]} />

      <main className="flex-1 pt-32">
        <div className="mx-auto max-w-[1120px] px-4 pb-16 lg:px-6">
          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-2 text-xs text-white/40">
            <Link href="/" className="hover:text-[#F58220]">
              خانه
            </Link>
            <ArrowRight className="h-3 w-3" />
            <span className="text-white/70">ثبت آگهی</span>
          </nav>

          {submitted ? (
            <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/[0.06] p-10 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-400" />
              <h1 className="text-2xl font-black text-white">
                {transactionType === "WANTED" || transactionType === "SERVICE_REQUEST" ? "درخواست شما ثبت شد!" : "آگهی شما ثبت شد!"}
              </h1>
              {/* H.1: show the created id + status so the user can verify */}
              {createdId && (
                <p className="mt-2 text-xs text-white/40">
                  شناسه: <span className="font-mono text-white/60">{createdId}</span>
                  {" · "}
                  وضعیت: <span className="font-bold text-amber-300">در انتظار بررسی</span>
                </p>
              )}
              <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/55">
                {transactionType === "WANTED" || transactionType === "SERVICE_REQUEST"
                  ? "درخواست شما پس از بررسی کارشناسان هویکس منتشر خواهد شد. پس از تأیید، در فهرست درخواست‌های شما نمایش داده می‌شود و برای تطبیق با عرضه‌های مرتبط در دسترس قرار می‌گیرد."
                  : "آگهی شما پس از بررسی کارشناسان هویکس منتشر خواهد شد. در صورت تأیید، در صفحهٔ آگهی‌ها نمایش داده می‌شود و وارد کمپین «فروش در ۷ روز» می‌گردد."}
              </p>
              {mediaWarning && (
                <div className="mx-auto mt-5 max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-right text-xs leading-6 text-amber-200">
                  <div>{mediaWarning}</div>
                  {mediaRepairEntityId && (
                    <button
                      type="button"
                      onClick={retryMediaAttachment}
                      disabled={mediaRepairing}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#F58220] px-4 py-2 font-bold text-white disabled:opacity-60"
                    >
                      {mediaRepairing && <Loader2 className="h-4 w-4 animate-spin" />}
                      {mediaRepairing ? "در حال بازیابی..." : "تلاش مجدد برای اتصال تصاویر"}
                    </button>
                  )}
                </div>
              )}
              {attributeWarning && (
                <div className="mx-auto mt-5 flex max-w-md items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-right">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div className="text-xs leading-6 text-amber-200">
                    {attributeWarning}
                  </div>
                </div>
              )}
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {/* P0-B: link to the created listing/request so the user can
                    verify it was saved (not just a generic /listings link). */}
                {createdSlug && transactionType !== "WANTED" && (
                  <Link
                    href={`/listings/${createdSlug}`}
                    className="rounded-xl bg-[#F58220] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#ff8c38]"
                  >
                    مشاهده آگهی ثبت‌شده
                  </Link>
                )}
                {createdId && (transactionType === "WANTED" || transactionType === "SERVICE_REQUEST") && (
                  <Link
                    href="/dashboard/wanted"
                    className="rounded-xl bg-[#F58220] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#ff8c38]"
                  >
                    مشاهده درخواست در داشبورد
                  </Link>
                )}
                <Link
                  href="/listings"
                  className="rounded-xl border border-white/15 px-6 py-3 text-sm font-bold text-white/80 transition hover:text-white"
                >
                  مشاهده آگهی‌ها
                </Link>
                <Link
                  href="/"
                  className="rounded-xl border border-white/15 px-6 py-3 text-sm font-bold text-white/80 transition hover:text-white"
                >
                  بازگشت به خانه
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Hero header */}
              <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[#F58220]">
                    <Sparkles className="h-3.5 w-3.5" />
                    HEAVIX LISTING · TAXONOMY V1.1
                  </span>
                  <h1 className="text-3xl font-black text-white lg:text-4xl">ثبت آگهی در بازار صنعتی HEAVIX</h1>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-white/45">
                    در ۷ مرحله، کالا، مواد معدنی، خدمات یا فرصت صنعتی خود را معرفی کنید.
                    نوع فعالیت، موضوع، مشخصات و موقعیت را متناسب با نیازتان ثبت کنید.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/60">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#F58220]" />
                    معامله امن هویکس
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/60">
                    <PackageCheck className="h-3.5 w-3.5 text-[#F58220]" />
                    کارشناسی اختصاصی
                  </span>
                </div>
              </div>

              {/* Stepper */}
              <div className="mb-8 flex items-center justify-between overflow-x-auto">
                {STEP_LABELS.map((label, idx) => {
                  const value = idx + 1;
                  const done = value < step;
                  const current = value === step;
                  return (
                    <div key={label} className="flex flex-1 items-center min-w-[80px]">
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black transition ${
                            done
                              ? "border-[#F58220] bg-[#F58220] text-white"
                              : current
                                ? "border-[#F58220] bg-transparent text-[#F58220]"
                                : "border-white/15 text-white/40"
                          }`}
                        >
                          {done ? <Check className="h-4 w-4" /> : value}
                        </div>
                        <span
                          className={`whitespace-nowrap text-[10px] font-bold sm:text-xs ${
                            current ? "text-[#F58220]" : done ? "text-white/70" : "text-white/35"
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                      {value < STEP_LABELS.length && (
                        <div
                          className={`mx-2 h-0.5 flex-1 rounded transition ${
                            done ? "bg-[#F58220]" : "bg-white/10"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-[#111] p-6 lg:p-8">
                {/* ───── STEP 1: TRANSACTION TYPE ───── */}
                {step === 1 && (
                  <div>
                    <SectionTitle
                      icon={<Sparkles className="h-5 w-5" />}
                      title="نوع معامله"
                      subtitle="نوع معامله‌ای که می‌خواهید ثبت کنید را انتخاب کنید"
                    />
                    <div className="mt-6">
                      <TransactionTypePicker value={transactionType} onChange={handleTransactionTypeChange} />
                    </div>

                    {/* P0-A: WANTED intent selector MOVED to Step 1 — BEFORE category selection.
                        The intent (buy/rent/service) determines the taxonomy roots shown
                        at Step 2 (serviceRoots for SERVICE_REQUEST, catalogRoots otherwise).
                        Moving it here ensures the category is always chosen with the correct
                        taxonomy and prevents service requests from selecting asset categories.
                        The user MUST pick an intent before proceeding (canProceed enforces it). */}
                    {transactionType === "WANTED" && (
                      <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
                        <label className={labelCls}>نوع تقاضا *</label>
                        <div className="flex flex-wrap gap-2">
                          {([
                            { v: "SALE", l: "خرید" },
                            { v: "RENT", l: "اجاره" },
                            { v: "SALE_AND_RENT", l: "خرید/اجاره" },
                            { v: "SERVICE_REQUEST", l: "خدمات" },
                          ] as const).map((t) => (
                            <button
                              key={t.v}
                              type="button"
                              onClick={() => handleWantedIntentChange(t.v)}
                              className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${wanted.intent === t.v ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20"}`}
                            >
                              {t.l}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-white/45">نوع تقاضا تعیین می‌کند این درخواست با کدام آگهی‌های عرضه تطبیق داده شود (خرید ← فروش/مزایده، اجاره ← اجاره، خدمات ← ارائه خدمت). این انتخاب باید پیش از انتخاب دسته‌بندی انجام شود.</p>
                      </div>
                    )}

                    <p className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-5 text-white/50">
                      نوع فعالیت، مسیر ثبت را تعیین می‌کند: عرضه یا درخواست کالا و تجهیزات، اجاره دارایی،
                      استعلام قیمت و مزایده به‌عنوان روش معامله، یا معرفی خدمت و ثبت درخواست خدمت.
                      دسته‌بندی و مشخصات بعدی بر اساس موضوع انتخاب‌شده تنظیم می‌شوند.
                    </p>
                  </div>
                )}

                {/* ───── STEP 2: CATEGORY (CATALOG only) ───── */}
                {step === 2 && (
                  <div>
                    <SectionTitle
                      icon={<Layers3 className="h-5 w-5" />}
                      title={isServiceFlow ? "دسته‌بندی خدمات" : "دسته‌بندی موضوع آگهی"}
                      subtitle={isServiceFlow
                        ? "حوزه خدمت، زیرحوزه و خدمت تخصصی موردنظر را انتخاب کنید"
                        : "موضوع، گروه و زیرگروه مرتبط با کالا، ماده معدنی یا فعالیت صنعتی را انتخاب کنید"}
                    />

                    {taxonomyLoading ? (
                      <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-6 text-center text-sm text-white/50">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#F58220]" />
                        در حال بارگذاری دسته‌بندی‌ها…
                      </div>
                    ) : taxonomyError ? (
                      <div role="alert" className="mt-6 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-5 text-center text-sm text-red-200">
                        <p>{taxonomyError}</p>
                        <button type="button" onClick={() => setTaxonomyRetryKey((current) => current + 1)} className="mt-3 rounded-lg border border-red-300/30 px-4 py-2 font-bold hover:bg-red-300/10">
                          تلاش مجدد
                        </button>
                      </div>
                    ) : categoryRoots.length === 0 ? (
                      <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-6 text-center text-sm text-white/50">
                        هنوز دسته‌بندی فعالی برای این نوع معامله تعریف نشده است.
                      </div>
                    ) : (
                      <div className="mt-6">
                        <CascadingCategoryPicker
                          roots={categoryRoots}
                          value={categoryId}
                          selectedPath={categoryPath}
                          onChange={(id, selectedPath) => {
                            setCategoryId(id);
                            setCategoryPath(selectedPath);
                            setAttributes({});
                            setAttributeDefs([]);
                            setAttributesLoaded(false);
                            setAttrErrors({});
                            setModelName("");
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ───── STEP 4: TECHNICAL ATTRIBUTES (after brand/model) ───── */}
                {step === 4 && (
                  <div>
                    <SectionTitle
                      icon={<Sliders className="h-5 w-5" />}
                      title={isServiceFlow ? (isServiceOffer ? "مشخصات خدمت قابل ارائه" : "مشخصات درخواست خدمت") : "مشخصات تخصصی موضوع آگهی"}
                      subtitle={`مشخصات متناسب با ${categoryPath.map((item) => item.name).join(" / ") || "موضوع انتخاب‌شده"}${form.brandLabel ? ` — ${form.brandLabel}` : ""}${modelName.trim() ? ` ${modelName.trim()}` : ""}`}
                    />
                    <div className="mt-6">
                      <AttributeFields
                        categoryId={categoryId || null}
                        modelId={null}
                        values={attributes}
                        onChange={(next) => {
                          setAttributes(next);
                          // Live-validate required fields.
                          setAttrErrors(validateAttributeFields(attributeDefs, next));
                        }}
                        errors={attrErrors}
                        onAttributesLoaded={(defs) => { setAttributeDefs(defs); setAttributesLoaded(true); }}
                      />
                    </div>
                    {attributesLoaded && attributeDefs.length === 0 && (
                      <div role="status" className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-6 text-white/55">
                        برای این دسته‌بندی ویژگی فنی فعالی تعریف نشده است؛ می‌توانید بدون مشخصات فنی ادامه دهید. در صورت نیاز، مدیر سامانه می‌تواند بعداً ویژگی‌های این دسته‌بندی را تنظیم کند.
                      </div>
                    )}
                    <p className="mt-4 text-[11px] text-white/40">
                      ویژگی‌های دارای علامت * الزامی هستند. ویژگی‌های «فیلترپذیر» در صفحهٔ آگهی‌ها قابل
                      فیلتر کردن خواهند بود.
                    </p>
                  </div>
                )}

                {/* ───── STEP 3: BRAND + MODEL + BASIC INFO ───── */}
                {step === 3 && (
                  <div>
                    <SectionTitle
                      icon={<Truck className="h-5 w-5" />}
                      title={isServiceFlow ? (isServiceOffer ? "معرفی خدمت و ارائه‌دهنده" : "اطلاعات درخواست خدمت") : "اطلاعات پایه و برند/مدل اختیاری"}
                      subtitle={isServiceFlow
                        ? (isServiceOffer ? "خدمت قابل ارائه، تخصص، دامنه کار و اطلاعات ارائه‌دهنده را ثبت کنید" : "عنوان و شرح نیاز خود را ثبت کنید؛ برند در صورت ارتباط اختیاری است")
                         : "عنوان و شرح را تکمیل کنید؛ انتخاب برند و مدل فقط در صورت ارتباط با موضوع آگهی لازم است"}
                    />
                    <div className="mt-6 space-y-5">
                      <div ref={brandWrapRef} className="relative">
                        <label className={labelCls}>برند مرتبط (اختیاری)</label>
                        <div className="relative">
                          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                          <input
                            value={brandQuery}
                            onChange={(e) => {
                              setBrandQuery(e.target.value);
                              setBrandId("");
                              setModelName("");
                                                        setAttributes({});
                              setAttributeDefs([]);
                              setAttributesLoaded(false);
                              setAttrErrors({});
                              // Text in this field is a search query, never a new Brand.
                              setForm((f) => ({ ...f, brandLabel: "" }));
                            }}
                            onFocus={() => {
                              setBrandOpen(true);
                              if (!brandQuery.trim()) setBrandBrowseKey((key) => key + 1);
                            }}
                            placeholder="نام برند را فارسی یا انگلیسی تایپ کنید…"
                            className={`${inputCls} pr-9`}
                            aria-label="جستجوی برند"
                            autoComplete="off"
                          />
                          {brandLoading && (
                            <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#F58220]" />
                          )}
                          {brandId && !brandLoading && (
                            <button
                              type="button"
                              onClick={() => {
                                setBrandId("");
                                setBrandQuery("");
                                setBrandBrowseKey(0);
                                setModelName("");
                                setForm((f) => ({ ...f, brandLabel: "" }));
                                setBrandResults([]);
                                setBrandOpen(false);
                              }}
                              className="absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
                              aria-label="پاک کردن برند"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {brandId && !brandOpen && (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#F58220]/30 bg-[#F58220]/10 px-3 py-1 text-xs font-bold text-[#F58220]">
                            <Check className="h-3 w-3" />
                            {form.brandLabel}
                          </div>
                        )}
                        {brandError && (
                          <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-300">
                            <span>{brandError}</span>
                            <button type="button" onClick={() => setBrandRetryKey((key) => key + 1)} className="font-bold text-[#F58220] underline">
                              تلاش مجدد
                            </button>
                          </div>
                        )}

                        {brandOpen && (
                          <div className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#0f0f0f] shadow-[0_25px_60px_rgba(0,0,0,.6)]">
                            {!brandQuery.trim() && brandLoading ? (
                              <div className="p-4 text-center text-xs text-white/50">در حال دریافت برندهای پیشنهادی…</div>
                            ) : brandResults.length === 0 ? (
                              <div className="p-4 text-center text-xs text-white/50">
                                {brandQuery.trim()
                                  ? "برندی پیدا نشد. املای فارسی یا انگلیسی را بررسی کنید؛ برای افزودن برند جدید باید مدیر آن را به فهرست مرکزی اضافه کند."
                                  : "هنوز برندی برای پیشنهاد وجود ندارد. نام برند را جستجو کنید."}
                              </div>
                            ) : (
                              <ul className="py-1">
                                {brandResults.map((r) => (
                                  <li key={r.id}>
                                    <button
                                      type="button"
                                      onClick={() => pickBrand(r)}
                                      className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition hover:bg-[#F58220]/10"
                                    >
                                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                                        {r.logoUrl ? (
                                          <img
                                            src={r.logoUrl}
                                            alt={r.name}
                                            className="h-full w-full object-contain p-1"
                                          />
                                        ) : (
                                          <Building2 className="h-4 w-4 text-[#F58220]/60" />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-white">
                                          {r.name}
                                        </p>
                                        {r.nameEn && (
                                          <p className="truncate text-[11px] text-white/40">
                                            {r.nameEn}
                                          </p>
                                        )}
                                        {r.status && r.status !== "ACTIVE" && BRAND_STATUS_LABELS[r.status]?.label && (
                                          <span className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-white/60">
                                            {BRAND_STATUS_LABELS[r.status].label}
                                          </span>
                                        )}
                                      </div>
                                      {r.country && (
                                        <span className="shrink-0 text-[10px] text-white/40">
                                          {r.country}
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Model is free text; it is not constrained by the central brand catalog. */}
                      <div>
                        <label className={labelCls}>مدل (اختیاری)</label>
                        <input
                          type="text"
                          value={modelName}
                          onChange={(e) => setModelName(e.target.value.slice(0, 120))}
                          disabled={!brandId}
                          maxLength={120}
                          placeholder={brandId ? "مدل را وارد کنید؛ مثلاً PC220 یا 320D" : "ابتدا برند را انتخاب کنید"}
                          className={inputCls}
                        />
                        <p className="mt-1 text-[10px] text-white/35">
                          نام مدل آزاد است و لازم نیست از قبل در فهرست مرکزی ثبت شده باشد.
                        </p>
                      </div>

                      <div>
                        <label className={labelCls}>عنوان آگهی *</label>
                        <input
                          value={form.title}
                          onChange={(e) => set("title", e.target.value)}
                          placeholder="مثلاً: بیل مکانیکی کوماتسو PC220 کارکرده"
                          className={inputCls}
                        />
                        <p className="mt-1 text-[10px] text-white/35">
                          حداقل ۵ کاراکتر. مدل و سال را ذکر کنید.
                        </p>
                      </div>

                      <div>
                        <label className={labelCls}>خلاصه کوتاه *</label>
                        <input
                          value={form.shortDesc}
                          onChange={(e) => set("shortDesc", e.target.value)}
                          placeholder="یک جمله خلاصه وضعیت دستگاه"
                          className={inputCls}
                        />
                      </div>

                      <div>
                        <label className={labelCls}>توضیحات کامل</label>
                        <textarea
                          value={form.description}
                          onChange={(e) => set("description", e.target.value)}
                          rows={5}
                          placeholder="شرح کامل دستگاه، وضعیت فنی، خدمات انجام‌شده، تاریخچه..."
                          className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-sm text-white outline-none transition focus:border-[#F58220] placeholder:text-white/25"
                        />
                      </div>

                      {!isServiceFlow && (
                        <div>
                          <label className={labelCls}>وضعیت دستگاه</label>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { v: "NEW", l: "نو" },
                              { v: "USED", l: "کارکرده" },
                              { v: "REFURBISHED", l: "بازسازی‌شده" },
                              { v: "FOR_PARTS", l: "قطعات" },
                            ].map((o) => (
                              <button
                                key={o.v}
                                type="button"
                                onClick={() => set("condition", o.v)}
                                className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                  form.condition === o.v
                                    ? "border-[#F58220] bg-[#F58220]/15 text-[#F58220]"
                                    : "border-white/10 text-white/60 hover:text-white"
                                }`}
                              >
                                {o.l}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ───── STEP 5: LOCATION ───── */}
                {step === 5 && (
                  <div>
                    <SectionTitle
                      icon={<MapPin className="h-5 w-5" />}
                      title="موقعیت کالا، خدمت یا پروژه"
                      subtitle="کشور، استان و شهر مرتبط با عرضه یا درخواست را انتخاب کنید (پیش‌فرض: ایران)"
                    />
                    <div className="mt-6">
                      <LocationPicker
                        value={location}
                        onChange={setLocation}
                        showExactPoint={["SALE", "RENT", "AUCTION"].includes(transactionType)}
                      />
                    </div>
                    <p className="mt-4 text-[11px] text-white/40">
                      موقعیت به‌عنوان بعد مستقل در تاکسونومی V1.1 ذخیره می‌شود و در فیلتر آگهی‌ها
                      قابل استفاده است.
                    </p>
                  </div>
                )}

                {/* ───── STEP 6: DETAILS (price/rental/images/contact) ───── */}
                {step === 6 && (
                  <div>
                    <SectionTitle
                      icon={<PackageCheck className="h-5 w-5" />}
                      title="جزئیات آگهی"
                      subtitle={
                        isServiceFlow
                          ? (isServiceOffer ? "شرح خدمت قابل ارائه، اطلاعات تماس و نمونه‌کارهای اختیاری" : "شرح درخواست، اطلاعات تماس و مستندات اختیاری")
                          : isRequestFlow
                            ? "شرح درخواست خرید یا استعلام قیمت؛ بودجه و تصاویر اختیاری هستند"
                          : isRent
                            ? "دوره اجاره، قیمت اجاره و تصاویر"
                            : isAuction
                              ? "قیمت پایه مزایده و تصاویر"
                              : "قیمت، تصاویر و اطلاعات تماس"
                      }
                    />
                    <div className="mt-6 space-y-5">
                      {isServiceFlow && (
                        <div className="rounded-2xl border border-[#F58220]/20 bg-[#F58220]/[0.04] p-5">
                          <label className={labelCls}>نوع خدمت تخصصی *</label>
                          <select
                            value={serviceTypeId}
                            onChange={(e) => setServiceTypeId(e.target.value)}
                            className={inputCls}
                            disabled={taxonomyLoading}
                          >
                            <option value="">انتخاب نوع خدمت</option>
                            {serviceTypes.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nameFa}{item.nameEn ? ` — ${item.nameEn}` : ""}
                              </option>
                            ))}
                          </select>
                          {serviceTypes.length === 0 && !taxonomyLoading && (
                            <p role="alert" className="mt-2 text-xs text-amber-300">
                              نوع خدمت فعالی ثبت نشده است. ابتدا فهرست را دوباره دریافت کنید.
                              <button type="button" onClick={() => setTaxonomyRetryKey((key) => key + 1)} className="mr-2 font-bold text-[#F58220] underline">تلاش مجدد</button>
                            </p>
                          )}
                        </div>
                      )}

                      {(transactionType === "WANTED" || isServiceRequest) && (
                        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
                          <p className="mb-3 text-sm font-black text-amber-300">{isServiceRequest ? "جزئیات درخواست خدمات" : "جزئیات درخواست خرید"}</p>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {/* P0-A: intent selector moved to Step 1. Here in Step 6
                                we show a read-only badge of the selected intent so the
                                user remembers what they picked, plus the quantity/
                                budget/deaddown fields. */}
                            <div className="sm:col-span-2">
                              <label className={labelCls}>نوع تقاضا (انتخاب‌شده در مرحله ۱)</label>
                              <div className="flex h-10 items-center rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-bold text-amber-200">
                                {isServiceRequest ? "خدمات" : wanted.intent === "SALE" ? "خرید"
                                  : wanted.intent === "RENT" ? "اجاره"
                                  : wanted.intent === "SALE_AND_RENT" ? "خرید/اجاره"
                                  : wanted.intent === "SERVICE_REQUEST" ? "خدمات"
                                  : "—"}
                              </div>
                            </div>
                            <div>
                              <label className={labelCls}>تعداد موردنیاز *</label>
                              <input value={wanted.quantity} onChange={(e) => setWanted((v) => ({ ...v, quantity: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>مهلت موردنیاز (اختیاری)</label>
                              <input type="date" value={wanted.deadline} onChange={(e) => setWanted((v) => ({ ...v, deadline: e.target.value }))} dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>حداقل بودجه (تومان)</label>
                              <input value={wanted.budgetMin} onChange={(e) => setWanted((v) => ({ ...v, budgetMin: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>حداکثر بودجه (تومان)</label>
                              <input value={wanted.budgetMax} onChange={(e) => setWanted((v) => ({ ...v, budgetMax: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" dir="ltr" className={inputCls} />
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-white/55">تعداد، بودجه و مهلت در اطلاعات ساختاریافته درخواست ذخیره می‌شوند.</p>
                        </div>
                      )}

                      {transactionType === "QUOTE" && (
                        <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-5">
                          <p className="mb-3 text-sm font-black text-sky-300">جزئیات استعلام قیمت (RFQ)</p>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className={labelCls}>تعداد موردنیاز *</label>
                              <input value={rfq.quantity} onChange={(e) => setRfq((v) => ({ ...v, quantity: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>مهلت دریافت پیشنهاد</label>
                              <input type="date" value={rfq.deadline} onChange={(e) => setRfq((v) => ({ ...v, deadline: e.target.value }))} dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>حداقل بودجه (تومان)</label>
                              <input value={rfq.budgetMin} onChange={(e) => setRfq((v) => ({ ...v, budgetMin: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>حداکثر بودجه (تومان)</label>
                              <input value={rfq.budgetMax} onChange={(e) => setRfq((v) => ({ ...v, budgetMax: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" dir="ltr" className={inputCls} />
                            </div>
                          </div>
                          <div className="mt-4">
                            <label className={labelCls}>شرایط تأمین و تحویل</label>
                            <textarea value={rfq.terms} onChange={(e) => setRfq((v) => ({ ...v, terms: e.target.value }))} rows={3} maxLength={3000} className={inputCls} />
                          </div>
                        </div>
                      )}

                      {isAuction && (
                        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
                          <p className="mb-3 text-sm font-black text-amber-300">شرایط مزایده</p>
                          <p className="mb-3 text-xs text-white/55">قیمت پایه از فیلد قیمت بالا دریافت می‌شود؛ سایر پارامترها باید دقیق وارد شوند.</p>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className={labelCls}>قیمت ذخیره (اختیاری)</label>
                              <input value={auction.reservePrice} onChange={(e) => setAuction((v) => ({ ...v, reservePrice: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>حداقل افزایش هر پیشنهاد *</label>
                              <input value={auction.minIncrement} onChange={(e) => setAuction((v) => ({ ...v, minIncrement: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>تاریخ و ساعت شروع *</label>
                              <input type="datetime-local" value={auction.startDate} onChange={(e) => setAuction((v) => ({ ...v, startDate: e.target.value }))} dir="ltr" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>تاریخ و ساعت پایان *</label>
                              <input type="datetime-local" value={auction.endDate} onChange={(e) => setAuction((v) => ({ ...v, endDate: e.target.value }))} dir="ltr" className={inputCls} />
                            </div>
                          </div>
                        </div>
                      )}

                      {!isServiceFlow && (
                        <div className="grid gap-5 sm:grid-cols-2">
                          <div>
                            <label className={labelCls}>سال ساخت</label>
                            <input
                              value={form.year}
                              onChange={(e) => set("year", e.target.value)}
                              placeholder="مثلاً: 2019"
                              dir="ltr"
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>ساعت کارکرد</label>
                            <input
                              value={form.hours}
                              onChange={(e) => set("hours", e.target.value)}
                              placeholder="مثلاً: 4200"
                              dir="ltr"
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>
                              {transactionType === "WANTED" ? "قیمت پیشنهادی دقیق (اختیاری؛ به‌جای بازه بودجه)" : isRequestFlow ? "بودجه یا قیمت پیشنهادی (اختیاری)" : isRent ? "قیمت اجاره (تومان)" : isAuction ? "قیمت پایه مزایده (تومان)" : "قیمت (تومان)"}{" "}
                              {!isRequestFlow && "*"}
                            </label>
                            <input
                              value={form.price}
                              onChange={(e) => set("price", isRequestFlow ? e.target.value.replace(/[^\d]/g, "") : e.target.value)}
                              placeholder="مثلاً: 8500000000"
                              dir="ltr"
                              className={inputCls}
                            />
                          </div>
                          {!isRequestFlow && (
                            <div>
                              <label className={labelCls}>نوع قیمت</label>
                              <select
                                value={isAuction ? "AUCTION" : form.priceType}
                                onChange={(e) => set("priceType", e.target.value)}
                                disabled={isAuction}
                                className={inputCls}
                              >
                                <option value="NEGOTIABLE">توافقی</option>
                                <option value="FIXED">مقطوع</option>
                                <option value="CALL_FOR_PRICE">تماس بگیرید</option>
                                <option value="AUCTION">مزایده</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rental period (only for RENT) */}
                      {isRent && (
                        <div className="rounded-2xl border border-[#F58220]/20 bg-[#F58220]/[0.04] p-5">
                          <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-black text-[#F58220]">
                            <Key className="h-3.5 w-3.5" />
                            مشخصات اجاره
                          </p>

                          {/* Rental period */}
                          <div>
                            <label className={labelCls}>دوره اجاره *</label>
                            <div className="flex flex-wrap gap-2">
                              {RENTAL_PERIODS.map((p) => (
                                <button
                                  key={p.v}
                                  type="button"
                                  onClick={() => set("rentalPeriod", p.v)}
                                  className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                    form.rentalPeriod === p.v
                                      ? "border-[#F58220] bg-[#F58220]/15 text-[#F58220]"
                                      : "border-white/10 text-white/60 hover:text-white"
                                  }`}
                                >
                                  {p.l}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Deposit + min period */}
                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className={labelCls}>ودیعه (تومان)</label>
                              <input
                                value={rental.deposit}
                                onChange={(e) => setRentalField("deposit", e.target.value.replace(/[^\d]/g, ""))}
                                placeholder="مثلاً: 50000000"
                                dir="ltr"
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>حداقل مدت اجاره</label>
                              <input
                                value={rental.minimumRentalPeriod}
                                onChange={(e) => setRentalField("minimumRentalPeriod", e.target.value.replace(/[^\d]/g, ""))}
                                placeholder="مثلاً: 3 (به واحد دوره)"
                                dir="ltr"
                                className={inputCls}
                              />
                            </div>
                          </div>

                          {/* Included services */}
                          <div className="mt-4">
                            <label className={labelCls}>خدمات همراه اجاره</label>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { k: "operatorIncluded", l: "اپراتور" },
                                { k: "fuelIncluded", l: "سوخت" },
                                { k: "transportIncluded", l: "حمل و نقل" },
                              ].map((opt) => (
                                <button
                                  key={opt.k}
                                  type="button"
                                  onClick={() =>
                                    setRentalField(
                                      opt.k as keyof typeof rental,
                                      !rental[opt.k as keyof typeof rental],
                                    )
                                  }
                                  className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                                    rental[opt.k as keyof typeof rental]
                                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                                      : "border-white/10 text-white/60 hover:text-white"
                                  }`}
                                >
                                  {rental[opt.k as keyof typeof rental] ? "✓ " : ""}
                                  {opt.l} شامل
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Availability */}
                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div>
                              <label className={labelCls}>شروع دسترسی</label>
                              <input
                                type="date"
                                value={rental.availabilityStart}
                                onChange={(e) => setRentalField("availabilityStart", e.target.value)}
                                dir="ltr"
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>پایان دسترسی</label>
                              <input
                                type="date"
                                value={rental.availabilityEnd}
                                onChange={(e) => setRentalField("availabilityEnd", e.target.value)}
                                dir="ltr"
                                className={inputCls}
                              />
                            </div>
                          </div>
                          <p className="mt-3 text-[11px] leading-5 text-white/45">
                            این اطلاعات در صفحهٔ اجاره و کارت آگهی به‌عنوان شرایط اجاره نمایش داده می‌شود.
                            ودیعه، حداقل مدت و خدمات شامل‌شده به اجاره‌گیرنده اعلام می‌شود.
                          </p>
                        </div>
                      )}

                      {/* Rental period (only for RENT) — old simple block removed, replaced by the panel above */}

                      <div>
                        <label className={labelCls}>سریال دستگاه</label>
                        <input
                          value={form.serialNumber}
                          onChange={(e) => set("serialNumber", e.target.value)}
                          placeholder="شماره سریال (اختیاری)"
                          dir="ltr"
                          className={inputCls}
                        />
                      </div>

                      {/* Contact info */}
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label className={labelCls}>نام تماس</label>
                          <input
                            value={form.sellerName}
                            onChange={(e) => set("sellerName", e.target.value)}
                            placeholder="نام فروشنده / شرکت"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>شماره تماس</label>
                          <input
                            value={form.sellerPhone}
                            onChange={(e) => set("sellerPhone", e.target.value)}
                            placeholder="مثلاً: 09123456789"
                            dir="ltr"
                            className={inputCls}
                          />
                        </div>
                      </div>

                      {/* Media */}
                      <>
                        {(transactionType === "WANTED" || isServiceRequest) && (
                          <p className="text-xs leading-6 text-white/55">
                            تصاویر درخواست ابتدا به‌صورت خصوصی بارگذاری می‌شوند و فقط پس از تأیید کارشناسان و انتشار درخواست برای عموم قابل مشاهده خواهند بود.
                          </p>
                        )}
                        {isRequestFlow && transactionType !== "WANTED" && <p className="text-xs leading-6 text-white/45">برای استعلام قیمت، افزودن تصویر اختیاری است.</p>}
                        <ListingImageUploader
                          images={images}
                          onChange={handleImagesChange}
                          onAssetsChange={handleStagedAssetsChange}
                          onUploadingChange={setImagesUploading}
                          entityType={isServiceRequest || transactionType === "WANTED" ? "BuyRequest" : "Listing"}
                          required={!isRequestFlow && !isServiceFlow}
                        />
                      </>
                    </div>
                  </div>
                )}

                {/* ───── STEP 7: REVIEW ───── */}
                {step === 7 && (
                  <div>
                    <SectionTitle
                      icon={<ShieldCheck className="h-5 w-5" />}
                      title="بازبینی و تأیید"
                      subtitle="اطلاعات آگهی خود را بررسی کنید"
                    />
                    <div className="mt-6 space-y-4">
                      <ReviewRow label="نوع معامله" value={transactionType} />
                      {isServiceFlow && <ReviewRow label="نوع خدمت" value={serviceTypes.find((item) => item.id === serviceTypeId)?.nameFa ?? "—"} />}
                      {(transactionType === "WANTED" || isServiceRequest) && (
                        <>
                          <ReviewRow label="تعداد موردنیاز" value={wanted.quantity || "—"} />
                          <ReviewRow
                            label="بازه بودجه"
                            value={[wanted.budgetMin, wanted.budgetMax].filter(Boolean).join(" تا ") || (form.price.trim() ? `${Number(form.price).toLocaleString("fa-IR")} تومان · قیمت دقیق` : "توافقی")}
                          />
                          <ReviewRow label="مهلت درخواست" value={wanted.deadline || "—"} />
                        </>
                      )}
                      {transactionType === "QUOTE" && (
                        <>
                          <ReviewRow label="تعداد موردنیاز" value={rfq.quantity || "—"} />
                          <ReviewRow label="بازه بودجه" value={[rfq.budgetMin, rfq.budgetMax].filter(Boolean).join(" تا ") || "توافقی"} />
                          <ReviewRow label="مهلت استعلام" value={rfq.deadline || "—"} />
                        </>
                      )}
                      {isAuction && (
                        <>
                          <ReviewRow label="حداقل افزایش مزایده" value={auction.minIncrement || "—"} />
                          <ReviewRow label="قیمت ذخیره" value={auction.reservePrice || "—"} />
                          <ReviewRow label="شروع مزایده" value={auction.startDate || "—"} />
                          <ReviewRow label="پایان مزایده" value={auction.endDate || "—"} />
                        </>
                      )}
                      <ReviewRow
                        label="دسته‌بندی"
                        value={categoryPath.map((item) => item.name).join(" / ") || "—"}
                      />
                      <ReviewRow label="برند" value={form.brandLabel || "—"} />
                      <ReviewRow label="مدل" value={modelName.trim() || "—"} />
                      <ReviewRow label="عنوان" value={form.title || "—"} />
                      <ReviewRow label="وضعیت" value={{ NEW: "نو", USED: "کارکرده", REFURBISHED: "بازسازی‌شده", FOR_PARTS: "قطعات" }[form.condition] ?? "—"} />
                      <ReviewRow label="سال ساخت" value={form.year || "—"} />
                      <ReviewRow label="ساعت کارکرد" value={form.hours ? `${form.hours} ساعت` : "—"} />
                      {!isRequestFlow && <ReviewRow label="قیمت" value={form.price ? `${Number(form.price).toLocaleString("fa-IR")} تومان` : "—"} />}
                      {isRent && (
                        <ReviewRow
                          label="دوره اجاره"
                          value={RENTAL_PERIODS.find((p) => p.v === form.rentalPeriod)?.l ?? "—"}
                        />
                      )}
                      {isRent && (
                        <ReviewRow
                          label="ودیعه"
                          value={rental.deposit ? `${Number(rental.deposit).toLocaleString("fa-IR")} تومان` : "—"}
                        />
                      )}
                      {isRent && (
                        <ReviewRow
                          label="حداقل مدت اجاره"
                          value={rental.minimumRentalPeriod ? `${toFa(rental.minimumRentalPeriod)} واحد` : "—"}
                        />
                      )}
                      {isRent && (
                        <ReviewRow
                          label="خدمات شامل"
                          value={[
                            rental.operatorIncluded ? "اپراتور" : "",
                            rental.fuelIncluded ? "سوخت" : "",
                            rental.transportIncluded ? "حمل و نقل" : "",
                          ].filter(Boolean).join("، ") || "—"}
                        />
                      )}
                      <ReviewRow
                        label="موقعیت"
                        value={
                          [location.countryLabel, location.provinceLabel, location.cityLabel]
                            .filter(Boolean)
                            .join(" / ") || "—"
                        }
                      />
                      {location.latitude?.trim() && location.longitude?.trim() && (
                        <ReviewRow
                          label="نقطهٔ دقیق دستگاه"
                          value={`${location.latitude} ، ${location.longitude}`}
                        />
                      )}
                      {form.shortDesc && (
                        <ReviewRow label="خلاصه" value={form.shortDesc} />
                      )}
                      {form.description && (
                        <ReviewRow label="توضیحات" value={form.description.length > 100 ? form.description.slice(0, 100) + "…" : form.description} />
                      )}
                      {form.sellerName && (
                        <ReviewRow label="نام تماس" value={form.sellerName} />
                      )}
                      {form.sellerPhone && (
                        <ReviewRow label="شماره تماس" value={form.sellerPhone} />
                      )}
                      {transactionType === "RENT" && rental.availabilityStart && (
                        <ReviewRow label="شروع دسترس‌پذیری" value={rental.availabilityStart} />
                      )}
                      {transactionType === "RENT" && rental.availabilityEnd && (
                        <ReviewRow label="پایان دسترس‌پذیری" value={rental.availabilityEnd} />
                      )}
                      {transactionType === "QUOTE" && rfq.terms && (
                        <ReviewRow label="شرایط استعلام" value={rfq.terms.length > 100 ? rfq.terms.slice(0, 100) + "…" : rfq.terms} />
                      )}
                      {(transactionType === "WANTED" || isServiceRequest) && (wanted.intent || isServiceRequest) && (
                        <ReviewRow
                          label="نوع تقاضا"
                          value={
                            isServiceRequest ? "خدمات" : wanted.intent === "SALE" ? "خرید"
                            : wanted.intent === "RENT" ? "اجاره"
                            : wanted.intent === "SALE_AND_RENT" ? "خرید/اجاره"
                            : wanted.intent === "SERVICE_REQUEST" ? "خدمات"
                            : wanted.intent
                          }
                        />
                      )}
                      <ReviewRow
                        label="ویژگی‌ها"
                        value={
                          Object.keys(attributes).length > 0
                            ? `${Object.keys(attributes).length} ویژگی پر شده`
                            : "بدون ویژگی"
                        }
                      />
                      <ReviewRow label="تصاویر" value={`${images.length} تصویر`} />

                      <div className="mt-6 rounded-2xl border border-[#F58220]/20 bg-[#F58220]/[0.04] p-4">
                        <div className="flex items-start gap-3">
                          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#F58220]" />
                          <div>
                            <div className="text-sm font-bold text-white">ورود به کمپین «فروش در ۷ روز»</div>
                            <p className="mt-1 text-xs leading-6 text-white/55">
                              پس از تأیید کارشناسان، آگهی شما به‌طور خودکار وارد کمپین فروش تضمینی
                              هویکس می‌شود: کارشناسی فنی، ارزش‌گذاری، تطبیق با خریداران و عقد قرارداد.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={back}
                    disabled={step === 1}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-6 text-sm font-bold text-white/80 transition hover:text-white disabled:opacity-40"
                  >
                    <ArrowRight className="h-4 w-4" />
                    مرحله قبل
                  </button>

                  {step < 7 ? (
                    <button
                      type="button"
                      onClick={next}
                      disabled={!canProceed()}
                      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#F58220] px-8 text-sm font-bold text-white shadow-lg shadow-orange-600/20 transition hover:bg-[#ff8c38] disabled:opacity-40"
                    >
                      مرحله بعد
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={submitting || imagesUploading}
                      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {submitting ? "در حال ثبت..." : "ثبت نهایی آگهی"}
                    </button>
                  )}
                </div>

                {/* Submit error */}
                {step === 7 && submitError && (
                  <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-sm font-bold text-red-400">
                    ⚠ {submitError}
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

/* ── Helpers ── */
function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F58220]/15 text-[#F58220]">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-black text-white">{title}</h2>
        <p className="mt-0.5 text-xs text-white/45">{subtitle}</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <span className="text-xs font-bold text-white/45">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}
