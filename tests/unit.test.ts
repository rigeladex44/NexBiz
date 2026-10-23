import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { calculateTotal } from '../apps/api/src/pos';
import { permit, tokenHash } from '../apps/api/src/security';
import { productSchema, saleSchema } from '../packages/validation/src';
import { randomUUID } from 'node:crypto';
test('financial arithmetic preserves cents and line cost snapshots', () => {
  const result = calculateTotal([
    { price: new Prisma.Decimal('0.10'), cost: new Prisma.Decimal('0.03'), quantity: 3 },
    { price: new Prisma.Decimal('19.99'), cost: new Prisma.Decimal('10.50'), quantity: 2 },
  ]);
  assert.equal(result.total.toFixed(2), '40.28');
  assert.equal(result.cost.toFixed(2), '21.09');
});
test('catalog rejects floating input, negative money, extra tenant fields', () => {
  assert.equal(
    productSchema.safeParse({ name: 'Test', sku: 'SK', price: 0.1, cost: '0' }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({ name: 'Test', sku: 'SK', price: '-1', cost: '0' }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      name: 'Test',
      sku: 'SK',
      price: '1',
      cost: '0',
      tenantId: randomUUID(),
    }).success,
    false,
  );
});
test('checkout rejects duplicate products, zero and fractional quantities', () => {
  const item = { productId: randomUUID(), quantity: 1 };
  const base = {
    idempotencyKey: randomUUID(),
    shiftId: randomUUID(),
    payments: [{ method: 'CASH', amount: '1.00' }],
  };
  for (const items of [[item, item], [{ ...item, quantity: 0 }], [{ ...item, quantity: 1.5 }]])
    assert.equal(saleSchema.safeParse({ ...base, items }).success, false);
});
test('cashier cannot mutate catalog or stock; supervisors can', () => {
  const base = { tenantId: 't', membershipId: 'm', userId: 'u' };
  assert.throws(() => permit({ ...base, role: 'CASHIER' }, 'catalog.write'));
  assert.throws(() => permit({ ...base, role: 'CASHIER' }, 'inventory.write'));
  permit({ ...base, role: 'CASHIER' }, 'pos.use');
  permit({ ...base, role: 'SUPERVISOR' }, 'inventory.write');
});
test('session token is persisted as a digest', () => {
  assert.equal(tokenHash('secret').length, 64);
  assert.notEqual(tokenHash('secret'), 'secret');
});
