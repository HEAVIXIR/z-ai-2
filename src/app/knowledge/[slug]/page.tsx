import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Legacy knowledge article URLs are retained for compatibility only.
 * /articles/[slug] is the single canonical public content route.
 */
export default async function LegacyKnowledgeArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const article = await db.article.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { slug: true },
  });

  if (!article) notFound();

  permanentRedirect(`/articles/${encodeURIComponent(article.slug)}`);
}
