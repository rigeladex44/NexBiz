import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { PosService } from '../src/pos';
import { Database } from '../src/database';
const db = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seed dilarang pada production');
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error('DEMO_PASSWORD minimal 12 karakter');
  const hash = await argon2.hash(password);
  const tenants = [
    {
      slug: 'retail',
      name: 'Sentosa Mart',
      industry: 'Retail',
      products: [
        ['Beras Pandan Wangi 5 kg', 'RT-001', '78000', '64000'],
        ['Minyak Goreng 1 L', 'RT-002', '18500', '15500'],
        ['Kopi Arabika 200 g', 'RT-003', '45000', '32000'],
        ['Susu UHT 1 L', 'RT-004', '22000', '17500'],
        ['Gula Pasir 1 kg', 'RT-005', '17500', '14000'],
        ['Teh Melati 25 pcs', 'RT-006', '12500', '9000'],
      ],
    },
    {
      slug: 'fnb',
      name: 'Kopi Ruang Senja',
      industry: 'FnB',
      products: [
        ['Kopi Susu Aren', 'FB-001', '24000', '9000'],
        ['Croissant Butter', 'FB-002', '28000', '14000'],
        ['Matcha Latte', 'FB-003', '32000', '12000'],
      ],
    },
    {
      slug: 'workshop',
      name: 'Prima Motor Garage',
      industry: 'Workshop',
      products: [
        ['Oli Mesin 1 L', 'WS-001', '65000', '45000'],
        ['Busi Iridium', 'WS-002', '95000', '68000'],
        ['Filter Udara', 'WS-003', '45000', '28000'],
      ],
    },
    {
      slug: 'wholesale',
      name: 'Nusantara Distribusi',
      industry: 'Wholesale',
      products: [
        ['Air Mineral Karton', 'WH-001', '48000', '37000'],
        ['Mi Instan Karton', 'WH-002', '112000', '97000'],
        ['Tisu Karton', 'WH-003', '185000', '152000'],
      ],
    },
  ];
  for (const t of tenants) {
    // Re-running seed never resets real transactions or existing stock.
    const tenant = await db.tenant.upsert({
      where: { slug: t.slug },
      create: { slug: t.slug, name: t.name, industry: t.industry },
      update: {},
    });
    let outlet = await db.outlet.findFirst({ where: { tenantId: tenant.id } });
    if (!outlet)
      outlet = await db.outlet.create({ data: { tenantId: tenant.id, name: 'Outlet Utama' } });
    for (const role of ['OWNER', 'SUPERVISOR', 'CASHIER'] as const) {
      const email = `${role.toLowerCase()}@${t.slug}.demo`;
      const user = await db.user.upsert({
        where: { email },
        create: {
          email,
          name:
            role === 'OWNER'
              ? 'Andi Pratama'
              : role === 'SUPERVISOR'
                ? 'Dewi Lestari'
                : 'Rina Putri',
          passwordHash: hash,
        },
        update: {},
      });
      await db.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        create: { tenantId: tenant.id, userId: user.id, role },
        update: {},
      });
    }
    for (const [name, sku, price, cost] of t.products) {
      const exists = await db.product.findUnique({
        where: { tenantId_sku: { tenantId: tenant.id, sku } },
      });
      if (!exists)
        await db.$transaction(async (tx) => {
          const product = await tx.product.create({
            data: { tenantId: tenant.id, name, sku, price, cost },
          });
          const quantity = sku.endsWith('003') ? 8 : 100;
          await tx.stockBalance.create({
            data: { tenantId: tenant.id, outletId: outlet!.id, productId: product.id, quantity },
          });
          await tx.stockMovement.create({
            data: {
              tenantId: tenant.id,
              outletId: outlet!.id,
              productId: product.id,
              delta: quantity,
              reason: 'OPENING_STOCK',
            },
          });
        });
    }
    if (!(await db.sale.count({ where: { tenantId: tenant.id } }))) {
      const cashier = await db.membership.findFirstOrThrow({
        where: { tenantId: tenant.id, role: 'CASHIER' },
      });
      const shift =
        (await db.shift.findFirst({
          where: { tenantId: tenant.id, membershipId: cashier.id, closedAt: null },
        })) ||
        (await db.shift.create({
          data: {
            tenantId: tenant.id,
            outletId: outlet.id,
            membershipId: cashier.id,
            openingCash: '200000',
          },
        }));
      const product = await db.product.findFirstOrThrow({
        where: { tenantId: tenant.id },
        orderBy: { sku: 'asc' },
      });
      const pos = new PosService(db as Database);
      for (const quantity of [1, 2, 1])
        await pos.checkout(
          {
            tenantId: tenant.id,
            membershipId: cashier.id,
            userId: cashier.userId,
            role: 'CASHIER',
          },
          {
            idempotencyKey: randomUUID(),
            shiftId: shift.id,
            items: [{ productId: product.id, quantity }],
            payments: [{ method: 'CASH', amount: product.price.mul(quantity).toFixed(2) }],
          },
        );
      const cash = await db.payment.aggregate({
        where: { tenantId: tenant.id, sale: { shiftId: shift.id }, method: 'CASH' },
        _sum: { amount: true },
      });
      const expected = shift.openingCash.plus(cash._sum.amount || 0);
      await db.shift.update({
        where: { id: shift.id },
        data: { closedAt: new Date(), expectedCash: expected, countedCash: expected },
      });
    }
    console.log(`Seed ready: ${t.slug}`);
  }
}
main().finally(() => db.$disconnect());
