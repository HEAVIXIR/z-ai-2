import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync('src/app/admin/procurement/page.tsx', 'utf8');

describe('Admin procurement lifecycle controls', () => {
  it('offers the complete ordered progression rather than skipping lifecycle states', () => {
    expect(page).toContain('bulkStatus("PUBLISHED")');
    expect(page).toContain('bulkStatus("QUOTING")');
    expect(page).toContain('bulkStatus("AWARDED")');
    expect(page).toContain('bulkStatus("COMPLETED")');
    expect(page).toContain('شروع دریافت پیشنهاد');
  });

  it('disables bulk transitions when selected records are not in the required source state', () => {
    expect(page).toContain('canBulkPublish');
    expect(page).toContain('canBulkQuoting');
    expect(page).toContain('canBulkAward');
    expect(page).toContain('canBulkComplete');
    expect(page).toContain('canBulkCancel');
    expect(page).toContain('item.company !== null');
  });

  it('reports partial bulk failures and retains failed selections for retry', () => {
    expect(page).toContain('response.ok && payload.success === true');
    expect(page).toContain('setSelected(new Set(failedIds))');
    expect(page).toContain('ناموفق');
    expect(page).not.toContain('flash("عملیات گروهی انجام شد")');
  });
});
