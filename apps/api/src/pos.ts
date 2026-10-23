import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { saleSchema } from '../../../packages/validation/src';
import { Database } from './database';
import { Actor, permit } from './security';
export function calculateTotal(
  items: { price: Prisma.Decimal; cost: Prisma.Decimal; quantity: number }[],
) {
  return items.reduce(
    (a, i) => ({
      total: a.total.plus(i.price.mul(i.quantity)),
      cost: a.cost.plus(i.cost.mul(i.quantity)),
    }),
    { total: new Prisma.Decimal(0), cost: new Prisma.Decimal(0) },
  );
}
@Injectable()
export class PosService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async checkout(actor: Actor, input: z.infer<typeof saleSchema>) {
    permit(actor, 'pos.use');
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            // Serialize every sale and shift closing against the same row.
            await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${input.shiftId}::uuid AND "tenantId" = ${actor.tenantId}::uuid FOR UPDATE`;
            const shift = await tx.shift.findFirst({
              where: { id: input.shiftId, tenantId: actor.tenantId },
            });
            if (!shift) throw new NotFoundException('Shift tidak ditemukan');
            if (shift.membershipId !== actor.membershipId)
              throw new ForbiddenException('Shift milik pengguna lain');
            const existing = await tx.sale.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId: actor.tenantId,
                  idempotencyKey: input.idempotencyKey,
                },
              },
              include: { lines: true, payments: true },
            });
            if (existing) {
              if (existing.requestHash !== hash || existing.shiftId !== shift.id)
                throw new ConflictException('Idempotency key digunakan untuk transaksi berbeda');
              return existing;
            }
            if (shift.closedAt) throw new ConflictException('Shift sudah ditutup');
            const products = await tx.product.findMany({
              where: { tenantId: actor.tenantId, id: { in: input.items.map((i) => i.productId) } },
            });
            if (products.length !== input.items.length)
              throw new NotFoundException('Produk tidak ditemukan');
            const lines = input.items.map((i) => {
              const p = products.find((p) => p.id === i.productId)!;
              return { ...i, price: p.price, cost: p.cost, name: p.name };
            });
            const totals = calculateTotal(lines);
            const paid = input.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
            if (
              !paid.equals(totals.total) ||
              input.payments.some((p) => new Prisma.Decimal(p.amount).lte(0))
            )
              throw new ConflictException(
                'Pembayaran harus sesuai total; masukkan uang yang diterapkan setelah kembalian',
              );
            for (const i of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
              const result = await tx.stockBalance.updateMany({
                where: {
                  tenantId: actor.tenantId,
                  outletId: shift.outletId,
                  productId: i.productId,
                  quantity: { gte: i.quantity },
                },
                data: { quantity: { decrement: i.quantity } },
              });
              if (result.count !== 1) throw new ConflictException(`Stok tidak cukup: ${i.name}`);
            }
            const sale = await tx.sale.create({
              data: {
                tenantId: actor.tenantId,
                outletId: shift.outletId,
                shiftId: shift.id,
                idempotencyKey: input.idempotencyKey,
                requestHash: hash,
                ...totals,
                lines: {
                  create: lines.map((i) => ({
                    productId: i.productId,
                    name: i.name,
                    quantity: i.quantity,
                    unitPrice: i.price,
                    unitCost: i.cost,
                  })),
                },
                payments: { create: input.payments.map((p) => ({ ...p })) },
              },
              include: { lines: true, payments: true },
            });
            await tx.stockMovement.createMany({
              data: lines.map((i) => ({
                tenantId: actor.tenantId,
                outletId: shift.outletId,
                productId: i.productId,
                saleId: sale.id,
                delta: -i.quantity,
                reason: 'SALE',
              })),
            });
            await tx.auditLog.create({
              data: {
                tenantId: actor.tenantId,
                actorId: actor.userId,
                action: 'SALE_COMPLETED',
                entityId: sale.id,
              },
            });
            return sale;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2002'].includes(error.code) &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException('Transaksi bersamaan; coba lagi dengan key yang sama');
  }
}
