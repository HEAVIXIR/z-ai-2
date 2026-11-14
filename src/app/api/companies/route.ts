import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { checkCsrf } from "@/lib/csrf";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/api-helpers";
import { trackError } from "@/lib/error-tracking";
import { isCommercialPersonaKey } from "@/lib/identity/standard";
import { COMPANY_CREATE } from "@/lib/rate-limit-presets";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey, getClientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/companies — public list. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const province = url.searchParams.get("province") || undefined;
    const limit = Math.min(50, Number(url.searchParams.get("limit")) || 30);

    const where: any = { status: "ACTIVE" };
    if (q) where.name = { contains: q };
    if (province) where.province = province;

    const companies = await db.company.findMany({
      where,
      orderBy: [{ premium: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: { _count: { select: { listings: true } } },
    });
    return NextResponse.json({
      companies: companies.map((c) => ({
        ...c,
        listingsCount: c._count.listings,
        _count: undefined,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}


/** POST /api/companies — self-service organization onboarding. */
export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ ok: false, error: "csrf_failed" }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user || user.status !== "ACTIVE" || !user.emailVerified || !user.mobileVerified) {
      return NextResponse.json({ ok: false, error: "verified_account_required" }, { status: 403 });
    }

    const rl = rateLimit({
      key: rateLimitKey(user.id, COMPANY_CREATE.label),
      limit: COMPANY_CREATE.limit,
      windowMs: COMPANY_CREATE.windowMs,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", retryAfter: retryAfterSeconds(rl.resetAt) },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } },
      );
    }

    const bodyValue: unknown = await req.json().catch(() => null);
    if (!bodyValue || typeof bodyValue !== "object" || Array.isArray(bodyValue)) {
      return NextResponse.json({ ok: false, error: "invalid_company" }, { status: 400 });
    }
    const body = bodyValue as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const businessType = body.businessType;

    if (name.length < 2 || name.length > 120 ||
        !isCommercialPersonaKey(businessType) || businessType === "INDIVIDUAL") {
      return NextResponse.json({ ok: false, error: "invalid_company_profile" }, { status: 400 });
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const province = typeof body.province === "string" ? body.province.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const websiteInput = typeof body.website === "string" ? body.website.trim() : "";
    if (description.length > 5000 || city.length > 100 || province.length > 100 ||
        address.length > 500 || websiteInput.length > 255) {
      return NextResponse.json({ ok: false, error: "company_profile_too_long" }, { status: 400 });
    }

    let website: string | null = null;
    if (websiteInput) {
      try {
        const parsed = new URL(websiteInput);
        if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
          throw new Error("invalid");
        }
        website = parsed.toString();
      } catch {
        return NextResponse.json({ ok: false, error: "invalid_website" }, { status: 400 });
      }
    }

    const baseSlug = slugify(name) || "company";
    const slug = `${baseSlug}-${randomBytes(5).toString("hex")}`;
    const company = await db.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          name,
          slug,
          description: description || null,
          website,
          email: user.email,
          phone: user.mobile,
          address: address || null,
          city: city || null,
          province: province || null,
          businessType,
          verified: false,
          premium: false,
          status: "PENDING",
        },
        select: { id: true, name: true, slug: true, businessType: true, status: true, verified: true, createdAt: true },
      });

      const primaryMembership = await tx.companyMembership.findFirst({
        where: { userId: user.id, status: "ACTIVE", isPrimary: true },
        select: { id: true },
      });
      const membership = await tx.companyMembership.create({
        data: {
          companyId: created.id,
          userId: user.id,
          roleKey: "OWNER",
          status: "ACTIVE",
          isPrimary: !primaryMembership,
        },
        select: { id: true, roleKey: true, status: true, isPrimary: true },
      });

      await tx.userCommercialPersona.upsert({
        where: { userId_personaKey: { userId: user.id, personaKey: businessType } },
        create: { userId: user.id, personaKey: businessType, isPrimary: false, status: "PENDING_REVIEW" },
        update: {},
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: "USER",
          action: "company.create",
          entityType: "Company",
          entityId: created.id,
          afterJson: JSON.stringify({
            name: created.name,
            slug: created.slug,
            businessType: created.businessType,
            status: created.status,
            ownerMembershipId: membership.id,
          }),
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
          requestId: req.headers.get("x-request-id")?.slice(0, 128) ?? null,
        },
      });

      return { company: created, membership };
    });

    return NextResponse.json({
      ok: true,
      company: company.company,
      membership: company.membership,
      onboardingStatus: "PENDING_REVIEW",
    }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ ok: false, error: "company_conflict_retry" }, { status: 409 });
    }
    trackError(error, { endpoint: "POST /api/companies" });
    return NextResponse.json({ ok: false, error: "company_creation_unavailable" }, { status: 500 });
  }
}
