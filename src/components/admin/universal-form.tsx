// STEP 14.8-E: @ts-nocheck removed — Universal Engine must be type-safe.
// (was: // @ts-nocheck — HEAVIX Legacy: Owner=Migration, Scope=OldAdmin, Ticket=STEP-14.6-LEGACY)
'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, X, AlertCircle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { AdminResourceConfig, AdminField, FieldCondition } from '@/lib/admin/types';

/* ============================================================
   HEAVIX — STEP 07: Universal Form Engine
   V2.2 compliant:
     Field Schema → Visibility → Permission → Validation
     → Dependency → Renderer → Mutation → Audit

   Features:
   - Schema-driven (uses resource config fields)
   - Conditional fields (conditions array)
   - Field-level permissions (read/write per field)
   - Validation (required, min/max, pattern, custom)
   - Slug auto-generation (slugFrom)
   - Dependency (dependsOn — fetch options from API)
   - Field grouping (group property)
   - Field width (full/half/third)
   - Create + Update modes
   - Audit integration (via Universal API)
   - Loading/error/success states
   ============================================================ */

interface UniversalFormProps {
  config: AdminResourceConfig;
  /** If provided, form is in UPDATE mode. If null, CREATE mode. */
  resourceId?: string | null;
  /** Called after successful create/update */
  onSuccess?: (item: Record<string, any>) => void;
  /** Called when form is cancelled */
  onCancel?: () => void;
}

export function UniversalForm({ config, resourceId, onSuccess, onCancel }: UniversalFormProps) {
  const router = useRouter();
  const isUpdate = !!resourceId;
  const [values, setValues] = React.useState<Record<string, any>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [touched, setTouched] = React.useState<Set<string>>(new Set());

  // ── Fetch existing resource (for update mode) ─────────────
  const { data: existing, isLoading } = useQuery({
    queryKey: ['admin-resource-item', config.key, resourceId],
    queryFn: async () => {
      if (!resourceId) return null;
      const res = await fetch(`/api/admin/resources/${config.key}/${resourceId}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!resourceId,
  });

  // Initialize values from existing resource or defaults
  React.useEffect(() => {
    if (existing?.data) {
      setValues(existing.data as Record<string, any>);
    } else if (!resourceId) {
      // Create mode — set defaults
      const defaults: Record<string, any> = {};
      for (const field of config.fields) {
        if (field.defaultValue !== undefined) {
          defaults[field.key] = field.defaultValue;
        }
      }
      setValues(defaults);
    }
  }, [existing, resourceId, config.fields]);

  // ── Slug auto-generation ──────────────────────────────────
  React.useEffect(() => {
    // Find slug fields and auto-generate from their source
    for (const field of config.fields) {
      if (field.type === 'slug' && field.slugFrom) {
        const sourceValue = values[field.slugFrom];
        if (sourceValue && typeof sourceValue === 'string') {
          const slug = slugify(sourceValue);
          if (slug !== values[field.key]) {
            setValues(prev => ({ ...prev, [field.key]: slug }));
          }
        }
      }
    }
  }, [values, config.fields]);

  // ── Conditional visibility check ───────────────────────────
  function isFieldVisible(field: AdminField): boolean {
    if (field.visible === false) return false;
    if (!field.conditions || field.conditions.length === 0) return true;
    // ALL conditions must be met (AND logic)
    return field.conditions.every(cond => evaluateCondition(cond, values));
  }

  // ── Validation ────────────────────────────────────────────
  function validateField(field: AdminField, value: unknown): string | null {
    if (field.required && (value === null || value === undefined || value === '')) {
      return `${field.label} الزامی است`;
    }
    const v = field.validation;
    if (!v) return null;

    if (typeof value === 'string') {
      if (v.minLength && value.length < v.minLength) {
        return v.message || `${field.label} باید حداقل ${v.minLength} کاراکتر باشد`;
      }
      if (v.maxLength && value.length > v.maxLength) {
        return v.message || `${field.label} باید حداکثر ${v.maxLength} کاراکتر باشد`;
      }
      if (v.pattern) {
        const regex = new RegExp(v.pattern);
        if (!regex.test(value)) {
          return v.message || `${field.label} معتبر نیست`;
        }
      }
    }
    if (typeof value === 'number') {
      if (v.min !== undefined && value < v.min) {
        return v.message || `${field.label} باید حداقل ${v.min} باشد`;
      }
      if (v.max !== undefined && value > v.max) {
        return v.message || `${field.label} باید حداکثر ${v.max} باشد`;
      }
    }
    return null;
  }

  function validateAll(): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of config.fields) {
      if (!isFieldVisible(field)) continue;
      const err = validateField(field, values[field.key]);
      if (err) newErrors[field.key] = err;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // ── Mutation ──────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      // Filter to only visible + writable fields
      const data: Record<string, any> = {};
      for (const field of config.fields) {
        if (!isFieldVisible(field)) continue;
        // Field-level write policy — client-side UX enforcement only.
        // Fields declaring `permissions.write` are NOT sent in the
        // mutation payload from the client. The authoritative security
        // boundary is the server-side `applyFieldWritePolicyAsync`
        // (fail-closed: rejects the entire request if the user lacks the
        // field-level write permission). On the client, such fields are
        // rendered visible but disabled so the user is not silently
        // misled into editing a value that would be dropped.
        if (field.permissions?.write) continue;
        data[field.key] = values[field.key];
      }

      const url = isUpdate
        ? `/api/admin/resources/${config.key}/${resourceId}`
        : `/api/admin/resources/${config.key}`;
      const method = isUpdate ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(isUpdate ? 'به‌روزرسانی شد' : 'ایجاد شد', {
        description: config.titleFa,
      });
      onSuccess?.(data.data);
      if (!onSuccess) {
        router.push(config.adminPath);
      }
    },
    onError: (err: Error) => {
      toast.error('خطا در ذخیره‌سازی', { description: err.message });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll()) {
      toast.error('لطقاً خطاهای فرم را اصلاح کنید');
      return;
    }
    mutation.mutate();
  }

  // ── Group fields ──────────────────────────────────────────
  const visibleFields = config.fields.filter(isFieldVisible);
  const groups = new Map<string, AdminField[]>();
  for (const field of visibleFields) {
    const g = field.group || 'default';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(field);
  }

  // ── Loading state ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {Array.from(groups.entries()).map(([groupName, fields], gi) => (
        <div key={groupName} className="space-y-4">
          {gi > 0 && <Separator />}
          {groupName !== 'default' && (
            <h3 className="text-sm font-semibold text-muted-foreground">{groupName}</h3>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {fields.map(field => (
              <FormField
                key={field.key}
                field={field}
                value={values[field.key]}
                error={errors[field.key]}
                touched={touched.has(field.key)}
                onChange={(v) => {
                  setValues(prev => ({ ...prev, [field.key]: v }));
                  setTouched(prev => new Set(prev).add(field.key));
                  // Clear error on change
                  if (errors[field.key]) {
                    setErrors(prev => { const n = { ...prev }; delete n[field.key]; return n; });
                  }
                }}
                config={config}
                allValues={values}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Form actions */}
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            <X className="ml-1 size-4" /> انصراف
          </Button>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="ml-1 size-4 animate-spin" />
          ) : (
            <Save className="ml-1 size-4" />
          )}
          {isUpdate ? 'ذخیره تغییرات' : 'ایجاد'}
        </Button>
      </div>

      {/* Error display */}
      {mutation.isError && (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-sm text-rose-500">
          <AlertCircle className="size-4" />
          {(mutation.error as Error).message}
        </div>
      )}
    </form>
  );
}

// ════════════════════════════════════════════════════════════
// Single Field Renderer
// ════════════════════════════════════════════════════════════

function FormField({
  field, value, error, touched, onChange, config, allValues,
}: {
  field: AdminField;
  value: unknown;
  error?: string;
  touched: boolean;
  onChange: (v: unknown) => void;
  config: AdminResourceConfig;
  allValues: Record<string, any>;
}) {
  const widthClass = field.width === 'half' ? 'md:col-span-1' :
    field.width === 'third' ? 'md:col-span-1 lg:col-span-1' :
    'md:col-span-2 lg:col-span-3';

  // Field-level write permission — client-side UX enforcement.
  // Restricted fields stay visible (readable) but are rendered disabled
  // so the user is aware they cannot edit them. Server-side
  // `applyFieldWritePolicyAsync` is the authoritative security boundary.
  const isReadOnly = !!field.permissions?.write;

  return (
    <div className={cn('space-y-1.5', widthClass)}>
      <Label htmlFor={field.key} className="text-xs">
        {field.label}
        {field.required && <span className="mr-0.5 text-rose-500">*</span>}
        {isReadOnly && (
          <span
            className="mr-1 inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[9px] font-normal text-muted-foreground"
            title="این فیلد نیاز به مجوز خاص دارد و به‌صورت فقط‌خواندنی نمایش داده می‌شود"
          >
            <Lock className="size-2.5" />
            فقط‌خواندنی
          </span>
        )}
      </Label>

      {renderField(field, value, onChange, config, allValues, isReadOnly)}

      {field.helpText && (
        <p className="text-[10px] text-muted-foreground">{field.helpText}</p>
      )}
      {error && touched && (
        <p className="text-[10px] text-rose-500">{error}</p>
      )}
    </div>
  );
}

// ── Field type renderer ─────────────────────────────────────
function renderField(
  field: AdminField,
  value: unknown,
  onChange: (v: unknown) => void,
  config: AdminResourceConfig,
  allValues: Record<string, any>,
  disabled?: boolean,
): React.ReactNode {
  const inputId = field.key;

  switch (field.type) {
    case 'text':
    case 'slug':
      return (
        <Input
          id={inputId}
          type="text"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="text-xs"
          readOnly={field.type === 'slug' && !!field.slugFrom}
          disabled={disabled}
        />
      );

    case 'textarea':
      return (
        <Textarea
          id={inputId}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="text-xs"
          disabled={disabled}
        />
      );

    case 'number':
    case 'currency':
      return (
        <Input
          id={inputId}
          type="number"
          value={(value as number | string | null | undefined) ?? ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={field.placeholder}
          className="text-xs"
          disabled={disabled}
        />
      );

    case 'boolean':
      return (
        <div className={cn('flex h-9 items-center gap-2 rounded-md border px-3', disabled && 'opacity-60')}>
          <Switch
            checked={Boolean(value)}
            onCheckedChange={onChange}
            disabled={disabled}
          />
          <span className="text-xs">{Boolean(value) ? 'بله' : 'خیر'}</span>
        </div>
      );

    case 'select':
      return (
        <Select value={(value as string) ?? ''} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={field.placeholder ?? 'انتخاب...'} /></SelectTrigger>
          <SelectContent>
            {field.options?.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'date':
    case 'datetime':
      return (
        <Input
          id={inputId}
          type={field.type === 'datetime' ? 'datetime-local' : 'date'}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className="text-xs"
          disabled={disabled}
        />
      );

    case 'password':
      return (
        <Input
          id={inputId}
          type="password"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? '••••••••'}
          className="text-xs"
          disabled={disabled}
        />
      );

    case 'color':
      return (
        <div className={cn('flex items-center gap-2', disabled && 'opacity-60')}>
          <input
            type="color"
            value={(value as string) ?? '#000000'}
            onChange={e => onChange(e.target.value)}
            className="h-9 w-12 rounded border p-1"
            disabled={disabled}
          />
          <span className="font-mono text-xs">{(value as string) ?? ''}</span>
        </div>
      );

    case 'relation':
      return <RelationField field={field} value={value} onChange={onChange} config={config} disabled={disabled} />;

    case 'media':
      return (
        <div className={cn('flex items-center gap-2 rounded-md border p-2', disabled && 'opacity-60')}>
          {value ? <img src={String(value)} alt="" className="size-8 rounded object-cover" /> : null}
          <Input
            id={inputId}
            type="text"
            value={(value as string | null | undefined) ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder="URL تصویر"
            className="flex-1 text-xs"
            disabled={disabled}
          />
        </div>
      );

    case 'json':
      return (
        <Textarea
          id={inputId}
          value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          onChange={e => {
            try { onChange(JSON.parse(e.target.value)); }
            catch { onChange(e.target.value); }
          }}
          rows={4}
          className="font-mono text-xs"
          placeholder='{"key": "value"}'
          disabled={disabled}
        />
      );

    default:
      return (
        <Input
          id={inputId}
          type="text"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="text-xs"
          disabled={disabled}
        />
      );
  }
}

// ── Relation field (async dropdown) ───────────────────────
function RelationField({
  field, value, onChange, config, disabled,
}: {
  field: AdminField;
  value: unknown;
  onChange: (v: unknown) => void;
  config: AdminResourceConfig;
  disabled?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['relation', field.relation?.model],
    queryFn: async () => {
      if (!field.relation) return { data: { items: [] } };
      // Fetch from the universal API
      const res = await fetch(`/api/admin/resources/${field.relation.model}s?pageSize=100`, { credentials: 'include' });
      if (!res.ok) return { data: { items: [] } };
      return res.json();
    },
    enabled: !!field.relation,
  });

  const items = data?.data?.items ?? [];
  const labelField = field.relation?.labelField ?? 'name';

  return (
    <Select value={(value as string) ?? ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <SelectItem value="" disabled>در حال بارگذاری...</SelectItem>
        ) : items.length === 0 ? (
          <SelectItem value="" disabled>موردی یافت نشد</SelectItem>
        ) : (
          items.map((item: Record<string, any>) => (
            <SelectItem key={item.id as string} value={item.id as string} className="text-xs">
              {String(item[labelField] ?? item.id)}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

// ── Helpers ────────────────────────────────────────────────
function slugify(s: string): string {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function evaluateCondition(cond: FieldCondition, values: Record<string, any>): boolean {
  const val = values[cond.field];
  switch (cond.operator) {
    case 'eq': return val === cond.value;
    case 'neq': return val !== cond.value;
    case 'in': return Array.isArray(cond.value) && cond.value.includes(val);
    case 'notNull': return val !== null && val !== undefined;
    case 'isNull': return val === null || val === undefined;
    case 'gt': return typeof val === 'number' && typeof cond.value === 'number' && val > cond.value;
    case 'lt': return typeof val === 'number' && typeof cond.value === 'number' && val < cond.value;
    default: return true;
  }
}
