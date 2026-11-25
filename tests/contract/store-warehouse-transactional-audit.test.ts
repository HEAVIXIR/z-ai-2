import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/lib/store-inventory-service.ts'),
  'utf8',
);

function functionBody(name: string, nextName: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  const end = source.indexOf(`export async function ${nextName}(`, start + 1);
  expect(start, `missing function ${name}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing next function ${nextName}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Store warehouse transactional audit contract', () => {
  it.each([
    ['createWarehouse', 'updateWarehouse', 'create'],
    ['updateWarehouse', 'deleteWarehouse', 'update'],
    ['deleteWarehouse', 'listWarehouses', 'delete'],
  ])('%s commits the directory mutation and audit outbox event together', (name, nextName, operation) => {
    const body = functionBody(name, nextName);
    expect(body).toContain('storeDb.$transaction');
    expect(body).toContain('enqueueAuditOutbox');
    expect(body).not.toContain('logAudit(');
    expect(body).toContain(`store.warehouse.${operation}`);
    expect(body).toContain(`tx.warehouse.${operation}`);
  });
});
