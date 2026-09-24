/**
 * HEAVIX — STEP 05: Admin Resource Registry Types
 *
 * Type definitions for the Universal Admin Resource Engine.
 * Each resource defines its columns, filters, fields, actions,
 * and permissions — the <AdminResource> component uses these
 * to render tables, forms, and details automatically.
 */

// ── Column definition (for table view) ─────────────────────
export interface AdminColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'badge' | 'image' | 'currency' | 'relation' | 'json';
  sortable?: boolean;
  filterable?: boolean;
  visible?: boolean;       // default true
  width?: string;          // CSS width
  format?: (value: unknown, row: Record<string, unknown>) => string;
  relation?: {
    model: string;
    labelField: string;    // e.g., 'name' or 'title'
  };
}

// ── Filter definition ──────────────────────────────────────
export interface AdminFilter {
  key: string;
  label: string;
  type: 'text' | 'select' | 'boolean' | 'date-range' | 'number-range';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

// ── Field definition (for form view) ───────────────────────
export interface AdminField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multi-select' | 'date' | 'datetime' | 'currency' | 'relation' | 'media' | 'rich-text' | 'json' | 'password' | 'color' | 'slug';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  relation?: {
    model: string;
    labelField: string;
    filter?: Record<string, unknown>;
  };
  helpText?: string;
  defaultValue?: unknown;
  visible?: boolean;
  // For slug fields: auto-generate from another field
  slugFrom?: string;

  // STEP 07 — V2.2 enhancements:

  /** Conditional visibility: show this field only when conditions are met */
  conditions?: FieldCondition[];

  /** Validation rules */
  validation?: FieldValidation;

  /** Field-level permissions (separate from resource-level) */
  permissions?: {
    read?: string;   // permission key needed to READ this field
    write?: string;  // permission key needed to WRITE this field
  };

  /** Field group (for visual grouping in the form) */
  group?: string;

  /** Width: full | half | third */
  width?: 'full' | 'half' | 'third';

  /** Dependency: auto-populate options based on another field's value */
  dependsOn?: {
    field: string;        // the controlling field
    // When controlling field equals this value, show/update options
    value?: unknown;
    // API to fetch options when dependency changes
    apiPath?: string;
  };
}

// ── Conditional field visibility ───────────────────────────
export interface FieldCondition {
  /** The field to check */
  field: string;
  /** The operator */
  operator: 'eq' | 'neq' | 'in' | 'notNull' | 'isNull' | 'gt' | 'lt';
  /** The value to compare against */
  value?: unknown;
}

// ── Field validation ────────────────────────────────────────
export interface FieldValidation {
  /** Minimum length for text fields */
  minLength?: number;
  /** Maximum length for text fields */
  maxLength?: number;
  /** Minimum value for number fields */
  min?: number;
  /** Maximum value for number fields */
  max?: number;
  /** Regex pattern for text fields */
  pattern?: string;
  /** Custom validation message */
  message?: string;
  /** Validate function name (server-side) */
  validator?: string;
}

// ── Action definition (custom actions like publish, suspend) ─
export interface AdminAction {
  key: string;
  label: string;
  icon?: string;
  permission: string;
  type: 'inline' | 'modal' | 'confirm';
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  // For confirm type: confirmation message
  confirmMessage?: string;
  // The action calls this API endpoint
  apiPath?: string;
  apiMethod?: 'POST' | 'PATCH' | 'DELETE';
}

// ── Bulk action definition ──────────────────────────────────
export interface AdminBulkAction {
  key: string;
  label: string;
  icon?: string;
  permission: string;
  type: 'confirm' | 'modal';
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  confirmMessage?: string;
  apiPath?: string;
  apiMethod?: 'POST' | 'PATCH' | 'DELETE';
}

// ── Resource configuration ─────────────────────────────────
export interface AdminResourceConfig {
  /** Resource key (e.g., 'listings', 'brands', 'users') */
  key: string;
  /** Persian display title */
  titleFa: string;
  /** English title */
  titleEn?: string;
  /** Icon name (lucide-react string) */
  icon?: string;
  /** Prisma model name (e.g., 'listing' for prisma.listing) */
  model: string;
  /** API base path (e.g., '/api/admin/listings') */
  apiBase: string;
  /** Admin page path (e.g., '/admin/listings') */
  adminPath: string;

  // Permissions
  permissions: {
    read?: string;
    create?: string;
    update?: string;
    delete?: string;
    export?: string;
  };

  // Table view
  columns: AdminColumn[];
  filters?: AdminFilter[];
  defaultSort?: { field: string; order: 'asc' | 'desc' };
  pageSize?: number;

  // Form view
  fields: AdminField[];

  // Detail view tabs
  detailTabs?: { key: string; label: string; type: 'overview' | 'relations' | 'activity' | 'audit' | 'media' }[];

  // Custom actions
  actions?: AdminAction[];
  bulkActions?: AdminBulkAction[];

  // Audit
  audit?: {
    enabled: boolean;
    entityType: string;   // e.g., 'Listing', 'Brand'
    actions: string[];     // e.g., ['listing.publish', 'listing.update']
  };

  // Search
  searchable?: boolean;
  searchFields?: string[];

  // Relations (for detail view)
  relations?: {
    label: string;
    resource: string;      // another resource key
    filterField: string;  // field on the related resource that points to this one
  }[];
}

// ── Registry ────────────────────────────────────────────────
export interface AdminResourceRegistry {
  resources: Map<string, AdminResourceConfig>;
  register(config: AdminResourceConfig): void;
  get(key: string): AdminResourceConfig | undefined;
  list(): AdminResourceConfig[];
  has(key: string): boolean;
}
