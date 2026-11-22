import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { executeAdminAIWithPolicy } from "@/lib/admin-ai-gateway";
import { generateArticleOutline, optimizeForSEO, checkListingQuality } from "@/lib/ai-content-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  const parsed = await readBoundedJson<unknown>(req, 64 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const body = parsed.value as Record<string, unknown>;
  const mode = String(body.mode ?? "outline").toLowerCase();

  if (mode === "outline") {
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const keywords = Array.isArray(body.keywords) ? body.keywords.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
    if (!topic) return NextResponse.json({ error: "topic is required", ok: false }, { status: 400 });
    const input = { topic: topic.slice(0, 600), keywords };
    const run = await executeAdminAIWithPolicy({ userId: user.id, taskType: "CONTENT_FACTORY", input, execute: async () => {
      const result = await generateArticleOutline({ ...input, userId: user.id });
      if (!result.success) throw new Error(result.error);
      return result.outline;
    }});
    if (!run.ok) return NextResponse.json({ error: run.error, ok: false }, { status: run.statusCode });
    return NextResponse.json({ ok: true, outline: run.output, source: "AI_SUGGESTED", verified: false });
  }

  if (mode === "seo") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!title) return NextResponse.json({ error: "title is required", ok: false }, { status: 400 });
    const input = { title: title.slice(0, 300), content: content.slice(0, 4500) };
    const run = await executeAdminAIWithPolicy({ userId: user.id, taskType: "CONTENT_FACTORY", input, execute: async () => {
      const result = await optimizeForSEO({ ...input, userId: user.id });
      if (!result.success) throw new Error(result.error);
      return result.seo;
    }});
    if (!run.ok) return NextResponse.json({ error: run.error, ok: false }, { status: run.statusCode });
    return NextResponse.json({ ok: true, seo: run.output, source: "AI_SUGGESTED", verified: false });
  }

  if (mode === "quality") {
    const listing = body.listing;
    if (!listing || typeof listing !== "object" || Array.isArray(listing)) return NextResponse.json({ error: "listing object is required", ok: false }, { status: 400 });
    const input = { listing };
    const run = await executeAdminAIWithPolicy({ userId: user.id, taskType: "CONTENT_FACTORY", input, execute: async () => {
      const result = await checkListingQuality({ listing: listing as Record<string, unknown>, userId: user.id });
      if (!result.success) throw new Error(result.error);
      return result.report;
    }});
    if (!run.ok) return NextResponse.json({ error: run.error, ok: false }, { status: run.statusCode });
    return NextResponse.json({ ok: true, report: run.output, source: "AI_SUGGESTED", verified: false });
  }
  return NextResponse.json({ error: "mode must be one of: outline | seo | quality", ok: false }, { status: 400 });
}