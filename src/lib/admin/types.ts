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
  /**
   * STEP 11.6 (Phase B.1 + B.2): Column-level READ + EXPORT permissions.
   *
   * Most resources do NOT declare field-level permissions on columns — the
   * resource-level `permissions.read` / `permissions.export` is sufficient.
   * But for SENSITIVE columns (e.g., `payment.trackingCode`,
   * `payment.type`), this provides backend-enforced projection at the
   * field level — the column is stripped from API responses + exports
   * if the user lacks the listed permission.
   *
   * The unified permission map (buildReadPermissionMap /
   * buildExportPermissionMap in field-policy.ts) walks BOTH `config.columns`
   * AND `config.fields` so a permission declared on either surface is
   * enforced. When both surfaces declare a permission for the same key,
   * AdminField takes precedence (field is the more specific surface).
   */
  permissions?: {
    read?: string;    // permission key needed to READ this column
    export?: string;  // permission key needed to EXPORT this column
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
  requiredWhen?: FieldCondition[];
  readonlyWhen?: FieldCondition[];
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

  /**
   * STEP 11.14 (Form Engine Closure): Conditional REQUIRED.
   * Field becomes required only when ALL conditions are met (AND logic).
   * Distinct from `required: boolean` (static) and `conditions` (visibility).
   *
   * Example: `taxId` is required only when `userType === 'COMPANY'`.
   *
   * Enforced BOTH client-side (universal-form.tsx isFieldRequired()) AND
   * server-side (resource-validator.ts checkRequiredWhen() post-Zod step).
   */

  /**
   * STEP 11.14 (Form Engine Closure): Conditional READONLY.
   * Field becomes read-only only when ALL conditions are met (AND logic).
   * Distinct from `permissions.write` (permission-based readonly).
   *
   * Example: `price` is read-only once `status === 'PUBLISHED'`.
   *
   * Enforced client-side (universal-form.tsx isFieldReadonly()).
   * Server-side write policy is enforced via `applyFieldWritePolicyAsync`.
   */

  /** Validation rules */
  validation?: FieldValidation;

  /** Field-level permissions (separate from resource-level) */
  permissions?: {
    read?: string;    // permission key needed to READ this field
    write?: string;   // permission key needed to WRITE this field
    /**
     * STEP 11.6 (Phase B.2): Field-level EXPORT permission.
     * If declared, the field is stripped from CSV/JSON export output
     * unless the user holds the listed permission. Distinct from `read`
     * because a user may read a field in detail view but not be allowed
     * to export it in bulk (defense in depth for sensitive fields like
     * `payment.trackingCode`, `payment.idempotencyKey`, `user.passwordHash`).
     */
    export?: string;
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
  /**
   * STEP 11.6 (Phase C.1): Action precondition.
   * Evaluated AFTER permission check, BEFORE mutation. If the precondition
   * fails, the action returns PRECONDITION_FAILED (409) — the entity is
   * NOT mutated.
   *
   * Example: `payment.refund` requires `status` ∈ {PAID, AUTHORIZED}.
   *
   * The executor is in action-engine.ts executeAction() — see precondition
   * evaluation step. The function receives the entity's current state
   * (the `before` snapshot) and the ActionContext.
   */
  precondition?: (item: Record<string, unknown>, ctx: { userId: string | null; reason?: string | null }) =>
    | { ok: true }
    | { ok: false; message: string };
  /**
   * STEP 11.8 (Audit Transactionality): Wrap mutation + audit in
   * `db.$transaction` so both commit atomically or both roll back.
   * Only effective for `database: 'main'` resources (store-schema
   * resources use a separate Prisma client — cross-DB transactions
   * are not supported by Prisma, see ADR-003).
   *
   * Use for CRITICAL operations where audit gaps are unacceptable:
   * financial mutations (payment.refund, payment.verify), identity
   * changes (user.suspend), irreversible state transitions.
   */
  transactional?: boolean;
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
  /**
   * P1 STORE-AWARENESS: Which Prisma client to use.
   * - 'main' (default): use `db` from '@/lib/db' (main schema)
   * - 'store': use `storeDb` from '@/lib/store-db' (store-schema.prisma)
   *
   * Store-schema resources (StockMovement, Warehouse, Return, Customer,
   * Mechanic, Supplier, etc.) MUST declare database: 'store'.
   * Main-schema resources (Listing, Brand, User, Product, etc.) can
   * omit this field (defaults to 'main').
   */
  database?: 'main' | 'store';
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
