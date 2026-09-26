/**
 * HEAVIX — Phase 3-3C: Content Engine — Public Article Page
 *
 * /articles/[slug] — public rendering of a PUBLISHED Article.
 *
 *   • Server Component + generateMetadata for SEO
 *     (title, description, OpenGraph, Twitter card, canonical URL)
 *   • Uses content-service.getArticle() for the canonical fetch
 *   • Increments viewCount on each render (best-effort, non-blocking)
 *   • 404 on missing slug OR non-PUBLISHED article
 *   • Lightweight markdown rendering (same rules as /knowledge/[slug])
 *   • Renders related articles (3 most recent published, different slug)
 *
 * NOTE: the legacy /knowledge/[slug] route continues to serve the
 * existing "هویکس دانش" UI; this new /articles/[slug] is the canonical
 * content-engine public route (matches the new admin nav key).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getArticle, readBrandId } from '@/lib/content-service';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { BookOpen, ArrowRight, Eye, Tag, Calendar, Building2 } from 'lucide-react';
import { toFa, faDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

// ── Category labels (kept in sync with admin articles page) ──
const CATEGORY_LABELS: Record<string, string> = {
  GUIDE: 'راهنما',
  COMPARISON: 'مقایسه',
  REVIEW: 'نقد و بررسی',
  NEWS: 'اخبار',
  TUTORIAL: 'آموزش',
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ── SEO metadata ───────────────────────────────────────────
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article || article.status !== 'PUBLISHED') {
    return {
      title: 'مقاله یافت نشد | هویکس',
      robots: { index: false, follow: false },
    };
  }

  const title = `${article.title} | هویکس دانش`;
  const description =
    article.excerpt?.trim() ||
    `هویکس دانش — ${article.title}. راهنماها، مقایسه‌ها و نقد و بررسی ماشین‌آلات صنعتی در بازار هویکس.`;
  const url = `/articles/${article.slug}`;
  const brandId = readBrandId(article.tags);
  const keywords = [
    article.title,
    CATEGORY_LABELS[article.category] || article.category,
    'ماشین‌آلات سنگین',
    'بازار صنعتی',
    'هویکس',
  ];
  if (brandId) keywords.push(`brand:${brandId}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      locale: 'fa_IR',
      siteName: 'HEAVIX',
      images: article.coverImage ? [{ url: article.coverImage, width: 1200, height: 630, alt: article.title }] : undefined,
      publishedTime: article.publishedAt?.toISOString() ?? undefined,
      authors: ['هویکس دانش'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: article.coverImage ? [article.coverImage] : undefined,
    },
    keywords,
    robots: { index: true, follow: true },
  };
}

// ── Markdown renderer (subset of the /knowledge/[slug] one) ──
function renderContent(content: string): React.ReactNode[] {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-3 space-y-1.5 pr-5">
          {listItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-7 text-zinc-700">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F58220]" />
              <span>{item.replace(/^-\s*/, '')}</span>
            </li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={idx} className="mt-6 mb-3 text-lg font-bold text-zinc-900">{trimmed.slice(3)}</h2>);
    } else if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h1 key={idx} className="mb-4 text-2xl font-black text-zinc-900">{trimmed.slice(2)}</h1>);
    } else if (trimmed.startsWith('- ')) {
      listItems.push(trimmed);
    } else if (trimmed === '') {
      flushList();
    } else {
      flushList();
      elements.push(<p key={idx} className="my-3 text-sm leading-7 text-zinc-700">{trimmed}</p>);
    }
  });
  flushList();
  return elements;
}

// ── Page body ──────────────────────────────────────────────
export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const [article, related] = await Promise.all([
    getArticle(slug),
    db.article.findMany({
      where: { status: 'PUBLISHED', slug: { not: slug } },
      orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
      take: 3,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        category: true,
      },
    }),
  ]);

  // 404 if missing or not published
  if (!article || article.status !== 'PUBLISHED') {
    notFound();
  }

  // Best-effort view-count increment (non-blocking, fire-and-forget)
  db.article
    .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  const tags = article.tags
    ? article.tags.split(',').map((t) => t.trim()).filter((t) => t && !t.startsWith('brand:'))
    : [];
  const brandId = readBrandId(article.tags);

  // JSON-LD structured data for SEO
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt ?? undefined,
    image: article.coverImage ? [article.coverImage] : undefined,
    datePublished: article.publishedAt?.toISOString() ?? undefined,
    author: { '@type': 'Organization', name: 'هویکس دانش' },
    publisher: { '@type': 'Organization', name: 'HEAVIX' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `/articles/${article.slug}` },
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <Header categories={[]} />

      <main className="flex-1 pt-28">
        <div className="mx-auto max-w-3xl px-6 py-12">
          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-2 text-xs text-zinc-500">
            <Link href="/knowledge" className="inline-flex items-center gap-1 transition hover:text-[#F58220]">
              <ArrowRight className="h-3 w-3" />
              هویکس دانش
            </Link>
            <span className="text-zinc-300">/</span>
            <span className="text-[#F58220]">{CATEGORY_LABELS[article.category] || article.category}</span>
          </nav>

          {/* Article header */}
          <div className="mb-8">
            <span className="inline-block rounded-full bg-[#F58220]/10 px-3 py-1 text-xs font-bold text-[#F58220]">
              {CATEGORY_LABELS[article.category] || article.category}
            </span>
            <h1 className="mt-4 text-3xl font-black leading-tight text-zinc-900 lg:text-4xl">
              {article.title}
            </h1>
            {article.excerpt && (
              <p className="mt-4 text-base leading-8 text-zinc-600">{article.excerpt}</p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
              {article.publishedAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {faDate(article.publishedAt)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {toFa(article.viewCount)} بازدید
              </span>
              {brandId && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  برند: <code className="text-[10px] text-zinc-400">{brandId}</code>
                </span>
              )}
            </div>
          </div>

          {/* Cover image */}
          {article.coverImage && (
            <div className="mb-8 overflow-hidden rounded-3xl border border-zinc-200">
              <img
                src={article.coverImage}
                alt={article.title}
                className="aspect-[16/9] w-full object-cover"
              />
            </div>
          )}

          {/* Article body */}
          <article className="rounded-3xl border border-zinc-200 bg-white p-6 lg:p-8">
            {renderContent(article.content)}
          </article>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Tag className="h-4 w-4 text-zinc-400" />
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] text-zinc-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Related articles */}
          {related.length > 0 && (
            <div className="mt-12">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-zinc-900">
                <BookOpen className="h-5 w-5 text-[#F58220]" />
                مقالات مرتبط
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/articles/${r.slug}`}
                    className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-[#F58220]/40 hover:shadow-sm"
                  >
                    {r.coverImage && (
                      <div className="mb-3 overflow-hidden rounded-xl">
                        <img
                          src={r.coverImage}
                          alt={r.title}
                          className="aspect-[16/9] w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </div>
                    )}
                    <h3 className="line-clamp-2 text-sm font-bold leading-6 text-zinc-800 transition-colors group-hover:text-[#F58220]">
                      {r.title}
                    </h3>
                    {r.excerpt && (
                      <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-zinc-500">
                        {r.excerpt}
                      </p>
                    )}
                    <span className="mt-2 inline-block rounded-full bg-[#F58220]/10 px-2 py-0.5 text-[10px] font-bold text-[#F58220]">
                      {CATEGORY_LABELS[r.category] || r.category}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer settings={null} />

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
