CREATE UNIQUE INDEX "Shift_one_open_per_member" ON "Shift" ("tenantId", "membershipId") WHERE "closedAt" IS NULL;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_nonnegative" CHECK (quantity >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_money_nonnegative" CHECK (price >= 0 AND cost >= 0);
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_money_nonnegative" CHECK (total >= 0 AND cost >= 0);
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_valid" CHECK (quantity > 0 AND "unitPrice" >= 0 AND "unitCost" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive" CHECK (amount > 0);
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_cash_nonnegative" CHECK ("openingCash" >= 0 AND ("countedCash" IS NULL OR "countedCash" >= 0));
