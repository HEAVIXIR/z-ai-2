/**
 * HEAVIX — STEP 14.5: Public Page Renderer
 *
 * Takes a published AdminPageVersion layout JSON and renders it
 * using registered widget renderers. This is the SAME renderer
 * used for both Preview and Production (no drift).
 *
 * V2.3: Only renders widgets from the registry. Rejects unknown keys.
 * V2.3: Fetches data from registry-based data sources (NOT arbitrary SQL).
 * V2.3: Enforces data source permissions server-side.
 */

import { db } from '@/lib/db';
import { getWidget, getDataSource, validateLayout, type PageLayout, type PageWidgetInstance } from '@/lib/admin/page-builder/widget-registry';
import { can } from '@/lib/authorization';
import HeroWidget from './widgets/hero-widget';
import ListingGridWidget from './widgets/listing-grid-widget';
import CategoryGridWidget from './widgets/category-grid-widget';
import SearchBoxWidget from './widgets/search-box-widget';
import CtaWidget from './widgets/cta-widget';
import RichTextWidget from './widgets/rich-text-widget';
import ImageWidget from './widgets/image-widget';
import StatsWidget from './widgets/stats-widget';
import ArticleListWidget from './widgets/article-list-widget';
import TrustBadgesWidget from './widgets/trust-badges-widget';

// Widget key → React component mapper
const WIDGET_RENDERERS: Record<string, React.ComponentType<{ props: Record<string, unknown>; data?: unknown }>> = {
  hero: HeroWidget,
  'listing-grid': ListingGridWidget,
  'category-grid': CategoryGridWidget,
  'search-box': SearchBoxWidget,
  cta: CtaWidget,
  'rich-text': RichTextWidget,
  image: ImageWidget,
  stats: StatsWidget,
  'article-list': ArticleListWidget,
  'trust-badges': TrustBadgesWidget,
};

// ── Fetch data for a widget from its data source ──────────
async function fetchWidgetData(widget: PageWidgetInstance): Promise<unknown> {
  const widgetDef = getWidget(widget.key);
  if (!widgetDef?.hasDataSource) return null;

  const dataSourceKey = widget.dataSource || widgetDef.defaultDataSource;
  if (!dataSourceKey) return null;

  const ds = getDataSource(dataSourceKey);
  if (!ds) return null;

  // Build API path, replacing {param} placeholders from widget props
  let apiPath = ds.apiPath;
  for (const [k, v] of Object.entries(widget.props || {})) {
    apiPath = apiPath.replace(`{${k}}`, String(v));
  }

  // Fetch data (server-side fetch)
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${base}${apiPath}`, { next: { revalidate: ds.cacheTtl || 60 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.items || json?.data || null;
  } catch {
    return null;
  }
}

// ── Main renderer ──────────────────────────────────────────
export interface PageRendererProps {
  layout: unknown;           // PageLayout JSON (from AdminPageVersion)
  userId?: string | null;     // for permission checks (null = public)
}

export async function PageRenderer({ layout, userId }: PageRendererProps) {
  // 1. Validate layout (rejects unknown widgets, SQL, JS)
  const validation = validateLayout(layout);
  if (!validation.valid) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">Page layout invalid: {validation.errors.join(', ')}</p>
      </div>
    );
  }

  const pageLayout = layout as PageLayout;

  // 2. Render each section → row → widget
  return (
    <div className="space-y-0">
      {pageLayout.sections.map((section, si) => (
        <section key={si} className="py-4 md:py-6">
          {section.title && (
            <h2 className="mb-4 text-center text-xl font-bold">{section.title}</h2>
          )}
          <div className="space-y-4">
            {section.rows.map((row, ri) => (
              <div
                key={ri}
                className="mx-auto grid max-w-7xl gap-4"
                style={{ gridTemplateColumns: `repeat(${row.widgets.length > 1 ? row.widgets.length : 1}, minmax(0, 1fr))` }}
              >
                {row.widgets.map((widget, wi) => (
                  <WidgetRenderer
                    key={wi}
                    widget={widget}
                    userId={userId}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Single widget renderer ─────────────────────────────────
async function WidgetRenderer({ widget, userId }: { widget: PageWidgetInstance; userId?: string | null }) {
  const widgetDef = getWidget(widget.key);
  if (!widgetDef) return null; // unknown widget — silently skip (already validated)

  // 1. Check widget permissions (if user is provided, i.e., preview mode)
  if (widgetDef.permissions && userId !== undefined) {
    for (const perm of widgetDef.permissions) {
      const hasPerm = await can(userId, perm);
      if (!hasPerm) {
        return (
          <div className="flex items-center justify-center rounded-lg border border-amber-500/30 p-4 text-xs text-amber-500">
            Permission required: {perm}
          </div>
        );
      }
    }
  }

  // 2. Fetch data from data source (if widget has one)
  let data: unknown = null;
  if (widgetDef.hasDataSource) {
    // Check data source permissions
    const dsKey = widget.dataSource || widgetDef.defaultDataSource;
    if (dsKey) {
      const ds = getDataSource(dsKey);
      if (ds?.permissions && userId !== undefined) {
        for (const perm of ds.permissions) {
          const hasPerm = await can(userId, perm);
          if (!hasPerm) {
            return (
              <div className="flex items-center justify-center rounded-lg border border-amber-500/30 p-4 text-xs text-amber-500">
                Data source permission required: {perm}
              </div>
            );
          }
        }
      }
    }
    data = await fetchWidgetData(widget);
  }

  // 3. Render using the registered component
  const Renderer = WIDGET_RENDERERS[widget.key];
  if (!Renderer) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-rose-500/30 p-4 text-xs text-rose-500">
        No renderer for widget "{widget.key}"
      </div>
    );
  }

  return <Renderer props={widget.props} data={data} />;
}
