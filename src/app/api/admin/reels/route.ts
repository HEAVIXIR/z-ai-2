import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs/promises";
import path from "path";
import { hasPermission } from "@/lib/rbac";
import { getClientIp } from "@/lib/request-context";
import { enforceRateLimit } from "@/lib/rate-limit-check";
import { UPLOAD } from "@/lib/rate-limit-presets";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ============================================================
   POST /api/admin/reels
   Generates a short social media reel (video) from a listing.

   Body: { listingId, platform?, duration? }
   - Uses the listing's main image as the video frame
   - Uses AI to generate a 5-second promotional video
   - Also generates a caption + hashtags for social media
   - Saves the video locally + creates a SocialReel record
   ============================================================ */

const PLATFORM_CONFIG: Record<string, { size: string; duration: number }> = {
  INSTAGRAM: { size: "1080x1920", duration: 5 },
  TIKTOK: { size: "1080x1920", duration: 5 },
  FACEBOOK: { size: "1920x1080", duration: 5 },
  WHATSAPP: { size: "1280x720", duration: 5 },
  TELEGRAM: { size: "1280x720", duration: 5 },
};

export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "reel.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires reel.manage" },
      { status: 403 },
    );
  }

  // ── Rate limit (UPLOAD preset, 20/h per IP) ──
  // This route generates + writes a video file to
  // /public/uploads/reels, so it is resource-consuming.
  const rl = enforceRateLimit(getClientIp(req), UPLOAD);
  if (!rl.ok) return rl.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { listingId, platform = "INSTAGRAM", duration = 5 } = body;

    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });

    const listing = await db.listing.findUnique({
      where: { id: listingId },
      include: {
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 3 },
        brand: { select: { name: true, nameEn: true } },
        category: { select: { name: true, nameEn: true } },
      },
    });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.INSTAGRAM;
    const mainImage = listing.images[0]?.url;
    if (!mainImage) return NextResponse.json({ error: "Listing has no image" }, { status: 400 });

    const brandName = listing.brand?.nameEn || listing.brand?.name || "";
    const categoryName = listing.category?.name || "ماشین‌آلات";
    const priceText = listing.price ? `${Number(listing.price).toLocaleString("fa-IR")} تومان` : "توافقی";
    const prompt = `Dynamic promotional video of a ${brandName} ${categoryName}. The machine is showcased with smooth cinematic camera movement. Professional industrial setting. High quality, engaging.`;

    // Generate social media caption + hashtags using LLM
    let caption = "";
    let hashtags = "";
    try {
      const zai = await ZAI.create();
      const captionRes = await zai.chat.completions.create({
        messages: [{
          role: "user",
          content: `برای آگهی زیر یک کپشن کوتاه و جذاب برای ${platform} بنویس + ۵ هشتگ مرتبط:

عنوان: ${listing.title}
برند: ${brandName}
دسته: ${categoryName}
قیمت: ${priceText}
شهر: ${listing.city || "—"}

فقط JSON: {"caption":"متن","hashtags":"#هشتگ۱,#هشتگ۲"}`,
        }],
        thinking: { type: "disabled" },
      });
      const content = captionRes.choices?.[0]?.message?.content ?? "";
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { const obj = JSON.parse(m[0]); caption = obj.caption || ""; hashtags = obj.hashtags || ""; }
    } catch { caption = `${listing.title} — ${priceText}`; hashtags = "#هویکس #ماشین‌آلات"; }

    // Create SocialReel record
    const reel = await db.socialReel.create({
      data: { listingId, platform, duration: config.duration, status: "PROCESSING", prompt, caption, hashtags, thumbnailUrl: mainImage },
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.socialReels.create",
      entityType: "SocialReel",
      entityId: reel.id,
      after: { listingId: reel.listingId, platform: reel.platform, status: reel.status, duration: reel.duration },
      reason: "via admin API",
    });

    // Generate video using AI (image-to-video)
    try {
      const zai = await ZAI.create();

      // Read image and convert to base64
      let imageBase64: string | undefined;
      const localPath = path.join(process.cwd(), "public", mainImage);
      try {
        const buffer = await fs.readFile(localPath);
        const ext = path.extname(mainImage).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        imageBase64 = `data:${mime};base64,${buffer.toString("base64")}`;
      } catch {
        if (mainImage.startsWith("http")) imageBase64 = mainImage;
      }

      const task = await zai.video.generations.create({
        prompt, image_url: imageBase64, quality: "speed", size: config.size, fps: 30, duration: config.duration,
      });

      // Poll for result
      let result = await zai.async.result.query(task.id);
      let pollCount = 0;
      while (result.task_status === "PROCESSING" && pollCount < 60) {
        pollCount++;
        await new Promise((r) => setTimeout(r, 5000));
        result = await zai.async.result.query(task.id);
      }

      if (result.task_status === "SUCCESS") {
        const videoUrl = result.video_result?.[0]?.url || result.video_url || result.url;
        if (videoUrl) {
          // Download and save locally
          try {
            const resp = await fetch(videoUrl);
            if (resp.ok) {
              const buffer = Buffer.from(await resp.arrayBuffer());
              const dir = path.join(process.cwd(), "public", "uploads", "reels");
              await fs.mkdir(dir, { recursive: true });
              const filename = `reel-${reel.id}.mp4`;
              await fs.writeFile(path.join(dir, filename), buffer);
              const localUrl = `/uploads/reels/${filename}`;
              await db.socialReel.update({ where: { id: reel.id }, data: { status: "READY", videoUrl: localUrl, taskId: task.id } });
              await logAudit({
                actorId: sessionUser.id,
                actorType: "ADMIN",
                action: "admin.socialReels.update",
                entityType: "SocialReel",
                entityId: reel.id,
                after: { status: "READY", videoUrl: localUrl, taskId: task.id },
                reason: "via admin API",
              });
              return NextResponse.json({ ok: true, reelId: reel.id, videoUrl: localUrl, caption, hashtags, status: "READY" });
            }
          } catch {
            // Use remote URL
            await db.socialReel.update({ where: { id: reel.id }, data: { status: "READY", videoUrl, taskId: task.id } });
            await logAudit({
              actorId: sessionUser.id,
              actorType: "ADMIN",
              action: "admin.socialReels.update",
              entityType: "SocialReel",
              entityId: reel.id,
              after: { status: "READY", videoUrl, taskId: task.id },
              reason: "via admin API",
            });
            return NextResponse.json({ ok: true, reelId: reel.id, videoUrl, caption, hashtags, status: "READY" });
          }
        }
      }

      await db.socialReel.update({ where: { id: reel.id }, data: { status: "FAILED", taskId: task.id } });
      await logAudit({
        actorId: sessionUser.id,
        actorType: "ADMIN",
        action: "admin.socialReels.update",
        entityType: "SocialReel",
        entityId: reel.id,
        after: { status: "FAILED", taskId: task.id },
        reason: "via admin API",
      });
      return NextResponse.json({ ok: false, error: "Video generation timed out", reelId: reel.id, caption, hashtags });
    } catch (videoErr: any) {
      await db.socialReel.update({ where: { id: reel.id }, data: { status: "FAILED" } });
      await logAudit({
        actorId: sessionUser.id,
        actorType: "ADMIN",
        action: "admin.socialReels.update",
        entityType: "SocialReel",
        entityId: reel.id,
        after: { status: "FAILED", error: videoErr?.message ?? "Video error" },
        reason: "via admin API",
      });
      return NextResponse.json({ ok: false, error: videoErr?.message ?? "Video error", reelId: reel.id, caption, hashtags });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}

/* GET — list reels */
export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "reel.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires reel.read" },
      { status: 403 },
    );
  }
  try {
    const url = new URL(req.url);
    const listingId = url.searchParams.get("listingId");
    const status = url.searchParams.get("status");
    const where: any = {};
    if (listingId) where.listingId = listingId;
    if (status) where.status = status;
    const reels = await db.socialReel.findMany({
      where, orderBy: { createdAt: "desc" }, take: 50,
      include: { listing: { select: { id: true, title: true, slug: true, images: { take: 1, orderBy: { isPrimary: "desc" } } } } },
    });
    return NextResponse.json({ ok: true, reels });
  } catch (err: any) { return NextResponse.json({ error: err?.message }, { status: 500 }); }
}
