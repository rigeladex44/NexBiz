import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { tokenHash } from '../apps/api/src/security';
const db = new PrismaClient();
const url = process.env.DATABASE_URL || '';
const password = 'Integration-only-2026!';
const base = 'http://127.0.0.1:4100/api/';
async function request(
  path: string,
  body?: unknown,
  cookie = '',
  extra: Record<string, string> = {},
) {
  await delay(100);
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'SmartBiz',
      Cookie: cookie,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function fixture(slug: string) {
  const tenant = await db.tenant.create({ data: { slug, name: slug, industry: 'Retail' } });
  const outlet = await db.outlet.create({ data: { tenantId: tenant.id, name: 'Test outlet' } });
  const product = await db.product.create({
    data: {
      tenantId: tenant.id,
      name: 'Decimal product',
      sku: 'TEST',
      price: '10.10',
      cost: '4.25',
    },
  });
  const product2 = await db.product.create({
    data: {
      tenantId: tenant.id,
      name: 'Second product',
      sku: 'TEST2',
      price: '20.20',
      cost: '8.50',
    },
  });
  for (const p of [product, product2]) {
    await db.stockBalance.create({
      data: { tenantId: tenant.id, outletId: outlet.id, productId: p.id, quantity: 10 },
    });
    await db.stockMovement.create({
      data: {
        tenantId: tenant.id,
        outletId: outlet.id,
        productId: p.id,
        delta: 10,
        reason: 'OPENING_STOCK',
      },
    });
  }
  const users: Record<string, string> = {};
  for (const role of ['OWNER', 'SUPERVISOR', 'CASHIER'] as const) {
    const user = await db.user.create({
      data: {
        email: `${role.toLowerCase()}@${slug}.test`,
        name: role,
        passwordHash: await argon2.hash(password),
      },
    });
    await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role } });
    users[role] = user.email;
  }
  return { tenant, outlet, product, product2, users };
}
test('PostgreSQL API vertical slice', { timeout: 120000 }, async (t) => {
  assert.match(
    new URL(url).pathname,
    /_test$/,
    'API tests require a dedicated database ending in _test',
  );
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
    env: { ...process.env, NODE_ENV: 'test', PORT: '4100', APP_ORIGIN: 'http://localhost:3000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (v) => {
    output += v;
  });
  child.stderr.on('data', (v) => {
    output += v;
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + 'health')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(ready, output);
    const a = await fixture('test-a-' + randomUUID()),
      b = await fixture('test-b-' + randomUUID());
    async function login(slug: string, email: string) {
      const r = await request('auth/login', { tenant: slug, email, password });
      assert.equal(r.status, 201);
      const cookie = r.headers.get('set-cookie');
      assert.ok(cookie?.includes('HttpOnly'));
      assert.ok(cookie.includes('SameSite=Strict'));
      return cookie.split(';')[0];
    }
    const owner = await login(a.tenant.slug, a.users.OWNER),
      cashier = await login(a.tenant.slug, a.users.CASHIER),
      other = await login(b.tenant.slug, b.users.OWNER);
    let shiftId = '';
    await t.test('anonymous, bad credentials and CSRF requests rejected', async () => {
      assert.equal((await request('products')).status, 401);
      assert.equal(
        (
          await request('auth/login', {
            tenant: a.tenant.slug,
            email: a.users.OWNER,
            password: 'incorrect-password',
          })
        ).status,
        401,
      );
      assert.equal(
        (await request('auth/logout', {}, owner, { Origin: 'https://evil.example' })).status,
        403,
      );
      const raw = await fetch(base + 'auth/logout', { method: 'POST', headers: { Cookie: owner } });
      assert.equal(raw.status, 403);
    });
    await t.test('tenant context cannot be injected and catalogs stay isolated', async () => {
      const r = await request('products?tenantId=' + b.tenant.id, undefined, owner);
      const p = await r.json();
      assert.equal(p.total, 2);
      assert.ok(p.items.every((p: { tenantId: string }) => p.tenantId === a.tenant.id));
      const hidden = await (await request('products', undefined, cashier)).json();
      assert.equal(hidden.items[0].cost, undefined);
      assert.equal(
        (
          await request(
            'products',
            { name: 'Fake tenant', sku: 'FT', price: '1', cost: '0', tenantId: b.tenant.id },
            owner,
          )
        ).status,
        400,
      );
    });
    await t.test('RBAC applies to every sensitive operation', async () => {
      assert.equal(
        (
          await request(
            'products',
            { name: 'Forbidden', sku: 'NO', price: '1', cost: '0' },
            cashier,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `inventory/${a.outlet.id}/adjust`,
            { productId: a.product.id, delta: 1, reason: 'Forbidden' },
            cashier,
          )
        ).status,
        403,
      );
      assert.equal((await request('dashboard', undefined, cashier)).status, 403);
      assert.equal((await request('inventory/movements', undefined, cashier)).status, 403);
    });
    await t.test(
      'catalog create and stock adjustment persist with audit; foreign outlet rejected',
      async () => {
        const r = await request(
          'products',
          { name: 'Added product', sku: 'ADDED', price: '5.50', cost: '2.25' },
          owner,
        );
        assert.equal(r.status, 201);
        const p = await r.json();
        assert.equal(
          (
            await request(
              `inventory/${a.outlet.id}/adjust`,
              { productId: p.id, delta: 5, reason: 'Initial stock' },
              owner,
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await request(
              `inventory/${b.outlet.id}/adjust`,
              { productId: p.id, delta: 1, reason: 'Cross tenant' },
              owner,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              `inventory/${a.outlet.id}/adjust`,
              { productId: p.id, delta: -6, reason: 'Too much stock' },
              owner,
            )
          ).status,
          409,
        );
        assert.equal(
          await db.auditLog.count({ where: { tenantId: a.tenant.id, action: 'STOCK_ADJUSTED' } }),
          1,
        );
      },
    );
    await t.test('open shift uniqueness and outlet isolation', async () => {
      const empty = await request('shifts/current', undefined, cashier);
      assert.equal(empty.status, 200);
      assert.deepEqual(await empty.json(), { shift: null });
      assert.equal(
        (await request('shifts', { outletId: b.outlet.id, openingCash: '100' }, cashier)).status,
        404,
      );
      const r = await request('shifts', { outletId: a.outlet.id, openingCash: '100' }, cashier);
      assert.equal(r.status, 201);
      shiftId = (await r.json()).id;
      assert.equal(
        (await request('shifts', { outletId: a.outlet.id, openingCash: '100' }, cashier)).status,
        409,
      );
    });
    const payload = () => ({
      idempotencyKey: randomUUID(),
      shiftId,
      items: [{ productId: a.product.id, quantity: 2 }],
      payments: [
        { method: 'CASH', amount: '10.10' },
        { method: 'NON_CASH', amount: '10.10' },
      ],
    });
    await t.test(
      'backend rejects wrong total, unknown product, and foreign/other users shift',
      async () => {
        const p = payload();
        assert.equal(
          (
            await request(
              'sales',
              { ...p, payments: [{ method: 'CASH', amount: '0.01' }] },
              cashier,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await request(
              'sales',
              { ...p, items: [{ productId: b.product.id, quantity: 2 }] },
              cashier,
            )
          ).status,
          404,
        );
        assert.equal((await request('sales', p, other)).status, 404);
        assert.equal((await request('sales', p, owner)).status, 403);
      },
    );
    await t.test(
      'concurrent duplicate checkout decrements stock once; mismatched replay rejected',
      async () => {
        const p = payload();
        const responses = await Promise.all([
          request('sales', p, cashier),
          request('sales', p, cashier),
        ]);
        assert.deepEqual(
          responses.map((r) => r.status),
          [201, 201],
        );
        const [one, two] = await Promise.all(responses.map((r) => r.json()));
        assert.equal(one.id, two.id);
        assert.equal(one.total, '20.2');
        assert.equal(
          (
            await db.stockBalance.findUniqueOrThrow({
              where: {
                tenantId_outletId_productId: {
                  tenantId: a.tenant.id,
                  outletId: a.outlet.id,
                  productId: a.product.id,
                },
              },
            })
          ).quantity,
          8,
        );
        assert.equal(await db.stockMovement.count({ where: { saleId: one.id } }), 1);
        assert.equal(await db.payment.count({ where: { saleId: one.id } }), 2);
        assert.equal(
          (
            await request(
              'sales',
              { ...p, items: [{ productId: a.product.id, quantity: 1 }] },
              cashier,
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      'insufficient stock rolls back earlier line, payment, sale and ledger',
      async () => {
        const before = await db.sale.count({ where: { tenantId: a.tenant.id } });
        const movements = await db.stockMovement.count({ where: { tenantId: a.tenant.id } });
        const r = await request(
          'sales',
          {
            idempotencyKey: randomUUID(),
            shiftId,
            items: [
              { productId: a.product2.id, quantity: 1 },
              { productId: a.product.id, quantity: 100 },
            ],
            payments: [{ method: 'CASH', amount: '1030.20' }],
          },
          cashier,
        );
        assert.equal(r.status, 409);
        assert.equal(await db.sale.count({ where: { tenantId: a.tenant.id } }), before);
        assert.equal(await db.stockMovement.count({ where: { tenantId: a.tenant.id } }), movements);
        assert.equal(
          (
            await db.stockBalance.findFirstOrThrow({
              where: { tenantId: a.tenant.id, productId: a.product2.id },
            })
          ).quantity,
          10,
        );
      },
    );
    await t.test('racing independent sales cannot oversell', async () => {
      const make = () => ({
        idempotencyKey: randomUUID(),
        shiftId,
        items: [{ productId: a.product.id, quantity: 5 }],
        payments: [{ method: 'CASH', amount: '50.50' }],
      });
      const r = await Promise.all([
        request('sales', make(), cashier),
        request('sales', make(), cashier),
      ]);
      assert.deepEqual(r.map((r) => r.status).sort(), [201, 409]);
    });
    await t.test(
      'ledger matches balance; cross-tenant composite foreign key enforced',
      async () => {
        for (const balance of await db.stockBalance.findMany({
          where: { tenantId: a.tenant.id },
        })) {
          const ledger = await db.stockMovement.aggregate({
            where: {
              tenantId: a.tenant.id,
              outletId: balance.outletId,
              productId: balance.productId,
            },
            _sum: { delta: true },
          });
          assert.equal(balance.quantity, ledger._sum.delta);
        }
        await assert.rejects(() =>
          db.stockBalance.create({
            data: {
              tenantId: a.tenant.id,
              outletId: a.outlet.id,
              productId: b.product.id,
              quantity: 1,
            },
          }),
        );
        await assert.rejects(() =>
          db.stockBalance.updateMany({ where: { tenantId: a.tenant.id }, data: { quantity: -1 } }),
        );
      },
    );
    await t.test(
      'financial reporting reconciles persisted payments and cost snapshots',
      async () => {
        const d = await (await request('dashboard', undefined, owner)).json();
        assert.equal(d.revenue, '70.7');
        assert.equal(d.grossProfit, '40.95');
        const sales = await (await request('sales', undefined, cashier)).json();
        assert.equal(sales.items.length, 2);
        assert.equal(sales.items[0].cost, undefined);
        assert.equal(sales.items[0].lines[0].unitCost, undefined);
        const otherSales = await (await request('sales', undefined, other)).json();
        assert.equal(otherSales.total, 0);
      },
    );
    await t.test('shift close reconciles cash and rejects further checkout', async () => {
      const r = await request(`shifts/${shiftId}/close`, { countedCash: '160.60' }, cashier);
      assert.equal(r.status, 201);
      const closed = await r.json();
      assert.equal(closed.expectedCash, '160.6');
      assert.equal(closed.variance, '0');
      assert.equal((await request('sales', payload(), cashier)).status, 409);
    });
    await t.test('expired sessions and suspended tenants cannot read business data', async () => {
      const membership = await db.membership.findFirstOrThrow({
        where: { tenantId: a.tenant.id, role: 'OWNER' },
      });
      const expired = randomUUID();
      await db.userSession.create({
        data: {
          membershipId: membership.id,
          tokenHash: tokenHash(expired),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      assert.equal((await request('products', undefined, `session=${expired}`)).status, 401);
      await db.tenant.update({ where: { id: b.tenant.id }, data: { active: false } });
      assert.equal((await request('products', undefined, other)).status, 401);
    });
    await t.test('logout revokes the session', async () => {
      assert.equal((await request('auth/logout', {}, owner)).status, 201);
      assert.equal((await request('me', undefined, owner)).status, 401);
    });
  } finally {
    child.kill('SIGTERM');
    await db.$disconnect();
  }
});
