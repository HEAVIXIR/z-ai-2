/**
 * HEAVIX — STEP 14: Widget Registry + Data Source Registry
 *
 * Widgets are CODE-DEFINED (not DB-defined) for security.
 * Admin configures widget PROPS (validated JSON), not code.
 *
 * V2.3 Security: NO arbitrary SQL/JS. Only registry-based data sources.
 */

export interface DataSourceDef {
  key: string;
  label: string;
  apiPath: string;
  cacheTtl?: number;
  permissions: string[];
}

export const DATA_SOURCES: DataSourceDef[] = [
  { key: 'listing.latest', label: 'آخرین آگهی‌ها', apiPath: '/api/listings?limit=12', cacheTtl: 60, permissions: ['listing.read'] },
  { key: 'listing.featured', label: 'آگهی‌های ویژه', apiPath: '/api/listings?featured=true&limit=8', cacheTtl: 120, permissions: [] },
  { key: 'taxonomy.categories', label: 'دسته‌بندی‌های عمومی', apiPath: '/api/taxonomy/categories?root=true&layer=CATALOG', cacheTtl: 300, permissions: [] },
  { key: 'product.latest', label: 'آخرین محصولات', apiPath: '/api/admin/resources/products?pageSize=12', cacheTtl: 120, permissions: ['product.read'] },
  { key: 'brand.popular', label: 'برندهای محبوب', apiPath: '/api/taxonomy/brands?limit=24', cacheTtl: 300, permissions: ['brand.read'] },
  { key: 'article.latest', label: 'آخرین مقالات', apiPath: '/api/articles?limit=6', cacheTtl: 120, permissions: ['content.read'] },
  { key: 'service.all', label: 'خدمات', apiPath: '/api/services?limit=50', cacheTtl: 600, permissions: ['content.read'] },
  { key: 'stats.site', label: 'آمار سایت', apiPath: '/api/admin/site-stats', cacheTtl: 300, permissions: ['admin.dashboard.read'] },
];

const dsMap = new Map(DATA_SOURCES.map(d => [d.key, d]));
export function getDataSource(key: string) { return dsMap.get(key); }
export function listDataSources() { return DATA_SOURCES; }

export interface WidgetPropSchema {
  key: string; label: string; type: 'text'|'textarea'|'number'|'boolean'|'select'|'color'|'media'|'json';
  required?: boolean; defaultValue?: unknown; options?: {value:string;label:string}[]; helpText?: string;
}

export interface WidgetDef {
  key: string; label: string; category: 'layout'|'content'|'data'|'media'|'navigation'|'utility';
  icon: string; description: string; propsSchema: WidgetPropSchema[];
  defaultDataSource?: string; hasDataSource?: boolean; permissions?: string[];
  defaultSize: { desktop:{w:number;h:number}; tablet:{w:number;h:number}; mobile:{w:number;h:number} };
  isSystem?: boolean;
}

export const WIDGETS: WidgetDef[] = [
  { key:'hero', label:'هیرو', category:'layout', icon:'Image', description:'بخش اصلی', isSystem:true,
    defaultSize:{desktop:{w:12,h:3},tablet:{w:12,h:3},mobile:{w:12,h:4}},
    propsSchema:[
      {key:'title',label:'عنوان (سازگاری)',type:'text'},
      {key:'title1',label:'بخش اول عنوان',type:'text',defaultValue:'خرید، فروش و اجاره'},
      {key:'highlight',label:'عنوان برجسته نارنجی',type:'text',defaultValue:'ماشین‌آلات سنگین'},
      {key:'badge',label:'نشان بالای عنوان',type:'text'},
      {key:'subtitle',label:'زیرعنوان',type:'textarea'},
      {key:'backgroundImage',label:'تصویر پس‌زمینه (سازگاری)',type:'media'},
      {key:'slide1',label:'تصویر اسلاید اول',type:'media'},
      {key:'slide2',label:'تصویر اسلاید دوم',type:'media'},
      {key:'slide3',label:'تصویر اسلاید سوم',type:'media'},
      {key:'cardServicesImg',label:'تصویر کارت خدمات',type:'media'},
      {key:'cardFeaturedImg',label:'تصویر کارت آگهی ویژه',type:'media'},
      {key:'cardExclusiveImg',label:'تصویر کارت فروش سریع',type:'media'},
      {key:'buttonText',label:'متن دکمه اصلی',type:'text',defaultValue:'ثبت آگهی رایگان'},
      {key:'buttonLink',label:'لینک دکمه اصلی',type:'text',defaultValue:'/listings/new'},
      {key:'secondBtnText',label:'متن دکمه دوم',type:'text',defaultValue:'مشاهده آگهی‌ها'},
      {key:'secondBtnLink',label:'لینک دکمه دوم',type:'text',defaultValue:'/listings'},
      {key:'titleFontSize',label:'اندازه عنوان',type:'select',defaultValue:'normal',options:[{value:'small',label:'کوچک'},{value:'normal',label:'معمولی'},{value:'large',label:'بزرگ'}]},
      {key:'statsWidth',label:'عرض بخش آمار',type:'select',defaultValue:'normal',options:[{value:'narrow',label:'باریک'},{value:'normal',label:'معمولی'},{value:'wide',label:'عریض'}]},
      {key:'overlayColorCustom',label:'رنگ پوشش پس‌زمینه',type:'color',defaultValue:'#0b0b0b'},
      {key:'slideOpacityCustom',label:'شفافیت تصویر پس‌زمینه',type:'text',defaultValue:'0.55'},
      {key:'slideIntervalCustom',label:'فاصله اسلایدها (میلی‌ثانیه)',type:'number',defaultValue:5000},
    ]},
  { key:'listing-grid', label:'شبکه آگهی‌ها', category:'data', icon:'LayoutGrid', description:'کارت‌های آگهی',
    hasDataSource:true, defaultDataSource:'listing.latest', permissions:[],
    defaultSize:{desktop:{w:12,h:4},tablet:{w:12,h:4},mobile:{w:12,h:6}},
    propsSchema:[
      {key:'title',label:'عنوان',type:'text'},
      {key:'columns',label:'ستون‌ها',type:'select',defaultValue:'4',options:[{value:'2',label:'۲'},{value:'3',label:'۳'},{value:'4',label:'۴'}]},
      {key:'limit',label:'حداکثر',type:'number',defaultValue:8},
    ]},
  { key:'category-grid', label:'دسته‌بندی‌ها', category:'data', icon:'FolderGrid', description:'کارت دسته‌ها',
    hasDataSource:true, defaultDataSource:'taxonomy.categories', permissions:[],
    defaultSize:{desktop:{w:12,h:3},tablet:{w:12,h:4},mobile:{w:12,h:6}},
    propsSchema:[{key:'title',label:'عنوان',type:'text'},{key:'columns',label:'ستون',type:'select',defaultValue:'4',options:[{value:'3',label:'۳'},{value:'4',label:'۴'}]}]},
  { key:'search-box', label:'جستجو', category:'navigation', icon:'Search', description:'باکس جستجو', isSystem:true,
    defaultSize:{desktop:{w:12,h:1},tablet:{w:12,h:1},mobile:{w:12,h:2}},
    propsSchema:[{key:'placeholder',label:'راهنما',type:'text',defaultValue:'جستجو...'},{key:'showFilters',label:'فیلتر',type:'boolean',defaultValue:true}]},
  { key:'cta', label:'دعوت به اقدام', category:'content', icon:'MousePointerClick', description:'دکمه CTA',
    defaultSize:{desktop:{w:12,h:2},tablet:{w:12,h:2},mobile:{w:12,h:3}},
    propsSchema:[{key:'title',label:'عنوان',type:'text',required:true},{key:'buttonText',label:'متن دکمه',type:'text',required:true},{key:'buttonLink',label:'لینک',type:'text',required:true}]},
  { key:'rich-text', label:'متن غنی', category:'content', icon:'FileText', description:'بخش متن',
    defaultSize:{desktop:{w:12,h:3},tablet:{w:12,h:3},mobile:{w:12,h:4}},
    propsSchema:[{key:'title',label:'عنوان',type:'text'},{key:'content',label:'محتوا',type:'textarea',required:true}]},
  { key:'image', label:'تصویر', category:'media', icon:'Image', description:'تصویر تکی',
    defaultSize:{desktop:{w:6,h:2},tablet:{w:12,h:2},mobile:{w:12,h:3}},
    propsSchema:[{key:'src',label:'آدرس',type:'media',required:true},{key:'alt',label:'متن جایگزین',type:'text'}]},
  { key:'stats', label:'آمار', category:'data', icon:'BarChart3', description:'آمار سایت',
    hasDataSource:true, defaultDataSource:'stats.site', permissions:['admin.dashboard.read'],
    defaultSize:{desktop:{w:12,h:2},tablet:{w:12,h:2},mobile:{w:12,h:3}},
    propsSchema:[{key:'title',label:'عنوان',type:'text'}]},
  { key:'article-list', label:'مقالات', category:'data', icon:'Newspaper', description:'آخرین مقالات',
    hasDataSource:true, defaultDataSource:'article.latest', permissions:['content.read'],
    defaultSize:{desktop:{w:12,h:3},tablet:{w:12,h:3},mobile:{w:12,h:4}},
    propsSchema:[{key:'title',label:'عنوان',type:'text'},{key:'limit',label:'تعداد',type:'number',defaultValue:6}]},
  { key:'trust-badges', label:'نشان‌های اعتماد', category:'content', icon:'ShieldCheck', description:'نشان‌ها',
    defaultSize:{desktop:{w:12,h:1},tablet:{w:12,h:2},mobile:{w:12,h:2}},
    propsSchema:[{key:'title',label:'عنوان',type:'text'},{key:'badges',label:'نشان‌ها',type:'json'}]},
];

const wMap = new Map(WIDGETS.map(w => [w.key, w]));
export function getWidget(key: string) { return wMap.get(key); }
export function listWidgets() { return WIDGETS; }
export function listWidgetsByCategory(cat: string) { return WIDGETS.filter(w => w.category === cat); }

// ── Layout types + validation ───────────────────────────────
export interface PageWidgetInstance { key:string; props:Record<string,unknown>; dataSource?:string; responsive?:{desktop?:{w:number;h:number};tablet?:{w:number;h:number};mobile?:{w:number;h:number}} }
export interface PageRow { widgets: PageWidgetInstance[] }
export interface PageSection { title?:string; rows: PageRow[] }
export interface PageLayout { sections: PageSection[] }

export interface ValidationResult { valid:boolean; errors:string[] }

export function validateLayout(layout: unknown): ValidationResult {
  const errors: string[] = [];
  if (!layout || typeof layout !== 'object') return {valid:false, errors:['Layout must be an object']};
  const pl = layout as PageLayout;
  if (!Array.isArray(pl.sections)) return {valid:false, errors:['Layout must have sections[]']};
  for (let si=0; si<pl.sections.length; si++) {
    const sec = pl.sections[si];
    if (!Array.isArray(sec.rows)) { errors.push(`Section ${si}: rows must be array`); continue; }
    for (let ri=0; ri<sec.rows.length; ri++) {
      const row = sec.rows[ri];
      if (!Array.isArray(row.widgets)) { errors.push(`S${si}R${ri}: widgets must be array`); continue; }
      for (let wi=0; wi<row.widgets.length; wi++) {
        const w = row.widgets[wi];
        const def = getWidget(w.key);
        if (!def) { errors.push(`S${si}R${ri}W${wi}: unknown widget "${w.key}"`); continue; }
        const ps = JSON.stringify(w.props||{});
        if (/SELECT |INSERT |DELETE |function\(|eval\(|<script/i.test(ps)) {
          errors.push(`S${si}R${ri}W${wi}: arbitrary SQL/JS rejected`); continue;
        }
        if (def.hasDataSource && w.dataSource) {
          if (!getDataSource(w.dataSource)) errors.push(`S${si}R${ri}W${wi}: unknown dataSource "${w.dataSource}"`);
        }
        for (const ps2 of def.propsSchema) {
          if (ps2.required && !(ps2.key in (w.props||{}))) errors.push(`S${si}R${ri}W${wi}: missing "${ps2.key}"`);
        }
      }
    }
  }
  return {valid: errors.length===0, errors};
}
