import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mergeHomepageSections } from "@/lib/homepage/sections";

/**
 * Public homepage section configuration endpoint.
 *
 * This endpoint is intentionally read-only. Default content belongs in an
 * explicit, reviewed seed/admin workflow; a public GET must never mutate the
 * application database as a side effect of a page visit.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseConfig(config: string | null | undefined): Record<string, unknown> {
  if (!config) return {};
  try {
    const parsed: unknown = JSON.parse(config);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const sections = await db.homePageSection.findMany({
      orderBy: { order: "asc" },
    });
    const activeSections = mergeHomepageSections(sections).filter((section) => section.active);

    return NextResponse.json({
      success: true,
      data: activeSections.map((section) => ({
        key: section.key,
        title: section.title,
        subtitle: section.subtitle,
        description: section.description,
        order: section.order,
        active: section.active,
        config: parseConfig(section.config),
      })),
    });
  } catch {
    return NextResponse.json(
      { success: false, data: [], error: "Homepage sections are temporarily unavailable" },
      { status: 503 },
    );
  }
}
