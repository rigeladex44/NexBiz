import { z } from 'zod';
export const loginSchema = z
  .object({
    tenant: z.string().min(1).max(80),
    email: z.string().email().max(200),
    password: z.string().min(8).max(200),
  })
  .strict();
export const productSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    sku: z.string().trim().min(2).max(60),
    price: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    cost: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  })
  .strict();
export const saleSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    shiftId: z.string().uuid(),
    items: z
      .array(
        z
          .object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10000) })
          .strict(),
      )
      .min(1)
      .max(100),
    payments: z
      .array(
        z
          .object({
            method: z.enum(['CASH', 'NON_CASH']),
            amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict()
  .refine((v) => new Set(v.items.map((i) => i.productId)).size === v.items.length, {
    message: 'Produk duplikat',
  });
export const adjustmentSchema = z
  .object({
    productId: z.string().uuid(),
    delta: z
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .refine((v) => v !== 0),
    reason: z.string().trim().min(5).max(200),
  })
  .strict();
export const openShiftSchema = z
  .object({ outletId: z.string().uuid(), openingCash: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/) })
  .strict();
export const closeShiftSchema = z
  .object({ countedCash: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/) })
  .strict();
