import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Inject,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Database } from './database';
import { SessionGuard, AuthRequest, newToken, tokenHash, permit } from './security';
import { PosService } from './pos';
import {
  loginSchema,
  productSchema,
  saleSchema,
  adjustmentSchema,
  openShiftSchema,
  closeShiftSchema,
} from '../../../packages/validation/src';
const uuid = z.string().uuid();
const pageSchema = z.coerce.number().int().min(1).max(100000).default(1);
@Controller('api')
export class PublicController {
  constructor(@Inject(Database) private db: Database) {}
  @Get('health') async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ready' };
  }
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('auth/login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = loginSchema.parse(body);
    const member = await this.db.membership.findFirst({
      where: {
        tenant: { slug: input.tenant, active: true },
        user: { email: input.email.toLowerCase() },
      },
      include: { user: true },
    });
    // Run a password KDF even if no account matched to limit timing disclosure.
    const valid = member
      ? await argon2.verify(member.user.passwordHash, input.password)
      : (await argon2.hash(input.password), false);
    if (!member || !valid)
      throw new UnauthorizedException('Tenant, email, atau kata sandi tidak sesuai');
    const token = newToken();
    await this.db.userSession.create({
      data: {
        tokenHash: tokenHash(token),
        membershipId: member.id,
        expiresAt: new Date(Date.now() + 8 * 3600 * 1000),
      },
    });
    res.cookie('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 3600 * 1000,
      path: '/api',
    });
    return { ok: true };
  }
}
@Controller('api')
@UseGuards(SessionGuard)
export class BusinessController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PosService) private pos: PosService,
  ) {}
  @Get('me') async me(@Req() req: AuthRequest) {
    const member = await this.db.membership.findUniqueOrThrow({
      where: { id: req.actor.membershipId },
      include: { user: { select: { name: true, email: true } }, tenant: true },
    });
    const outlets = await this.db.outlet.findMany({ where: { tenantId: req.actor.tenantId } });
    return { user: member.user, tenant: member.tenant, role: member.role, outlets };
  }
  @Post('auth/logout') async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.userSession.deleteMany({ where: { tokenHash: tokenHash(req.cookies.session) } });
    res.clearCookie('session', {
      path: '/api',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    return { ok: true };
  }
  @Get('products') async products(
    @Req() req: AuthRequest,
    @Query('search') search = '',
    @Query('page') pageRaw?: string,
  ) {
    const page = pageSchema.parse(pageRaw);
    const term = z.string().max(100).parse(search);
    const where = {
      tenantId: req.actor.tenantId,
      OR: [
        { name: { contains: term, mode: 'insensitive' as const } },
        { sku: { contains: term, mode: 'insensitive' as const } },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * 20,
        take: 20,
        include: { balances: true },
      }),
      this.db.product.count({ where }),
    ]);
    return {
      items: items.map((p) =>
        req.actor.role === 'CASHIER'
          ? { id: p.id, name: p.name, sku: p.sku, price: p.price, balances: p.balances }
          : p,
      ),
      total,
      page,
      pageSize: 20,
    };
  }
  @Post('products') async createProduct(@Req() req: AuthRequest, @Body() body: unknown) {
    permit(req.actor, 'catalog.write');
    const data = productSchema.parse(body);
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { ...data, tenantId: req.actor.tenantId } });
      await tx.auditLog.create({
        data: {
          tenantId: req.actor.tenantId,
          actorId: req.actor.userId,
          action: 'PRODUCT_CREATED',
          entityId: product.id,
        },
      });
      return product;
    });
  }
  @Post('inventory/:outletId/adjust') async adjust(
    @Req() req: AuthRequest,
    @Param('outletId') raw: string,
    @Body() body: unknown,
  ) {
    permit(req.actor, 'inventory.write');
    const outletId = uuid.parse(raw),
      input = adjustmentSchema.parse(body),
      tenantId = req.actor.tenantId;
    return this.db.$transaction(async (tx) => {
      if (
        !(await tx.outlet.findFirst({ where: { id: outletId, tenantId } })) ||
        !(await tx.product.findFirst({ where: { id: input.productId, tenantId } }))
      )
        throw new NotFoundException('Outlet atau produk tidak ditemukan');
      const key = { tenantId, outletId, productId: input.productId };
      await tx.stockBalance.upsert({
        where: { tenantId_outletId_productId: key },
        create: { ...key, quantity: 0 },
        update: {},
      });
      const changed = await tx.stockBalance.updateMany({
        where: { ...key, quantity: { gte: Math.max(0, -input.delta) } },
        data: { quantity: { increment: input.delta } },
      });
      if (changed.count !== 1) throw new ConflictException('Stok tidak boleh negatif');
      const movement = await tx.stockMovement.create({
        data: { ...key, delta: input.delta, reason: input.reason },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: req.actor.userId,
          action: 'STOCK_ADJUSTED',
          entityId: movement.id,
        },
      });
      return movement;
    });
  }
  @Get('inventory/movements') async movements(@Req() req: AuthRequest) {
    permit(req.actor, 'inventory.write');
    return this.db.stockMovement.findMany({
      where: { tenantId: req.actor.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        product: { select: { name: true, sku: true } },
        outlet: { select: { name: true } },
      },
    });
  }
  @Get('shifts/current') async currentShift(@Req() req: AuthRequest) {
    return {
      shift: await this.db.shift.findFirst({
        where: {
          tenantId: req.actor.tenantId,
          membershipId: req.actor.membershipId,
          closedAt: null,
        },
      }),
    };
  }
  @Post('shifts') async openShift(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = openShiftSchema.parse(body),
      tenantId = req.actor.tenantId;
    if (!(await this.db.outlet.findFirst({ where: { tenantId, id: input.outletId } })))
      throw new NotFoundException('Outlet tidak ditemukan');
    return this.db.$transaction(async (tx) => {
      const shift = await tx.shift.create({
        data: { ...input, tenantId, membershipId: req.actor.membershipId },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: req.actor.userId, action: 'SHIFT_OPENED', entityId: shift.id },
      });
      return shift;
    });
  }
  @Post('shifts/:id/close') async closeShift(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = uuid.parse(raw),
      input = closeShiftSchema.parse(body),
      tenantId = req.actor.tenantId;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${id}::uuid AND "tenantId" = ${tenantId}::uuid FOR UPDATE`;
      const shift = await tx.shift.findFirst({
        where: { id, tenantId, membershipId: req.actor.membershipId, closedAt: null },
      });
      if (!shift) throw new NotFoundException('Shift aktif tidak ditemukan');
      const cash = await tx.payment.aggregate({
        where: { tenantId, method: 'CASH', sale: { shiftId: id } },
        _sum: { amount: true },
      });
      const expectedCash = shift.openingCash.plus(cash._sum.amount || 0);
      const result = await tx.shift.update({
        where: { id },
        data: { closedAt: new Date(), countedCash: input.countedCash, expectedCash },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: req.actor.userId, action: 'SHIFT_CLOSED', entityId: id },
      });
      return { ...result, variance: new Prisma.Decimal(input.countedCash).minus(expectedCash) };
    });
  }
  @Post('sales') async checkout(@Req() req: AuthRequest, @Body() body: unknown) {
    const sale = await this.pos.checkout(req.actor, saleSchema.parse(body));
    return req.actor.role === 'CASHIER'
      ? {
          id: sale.id,
          total: sale.total,
          createdAt: sale.createdAt,
          lines: sale.lines.map((l) => ({
            id: l.id,
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          payments: sale.payments,
        }
      : sale;
  }
  @Get('sales') async sales(@Req() req: AuthRequest, @Query('page') pageRaw?: string) {
    permit(req.actor, 'sales.read');
    const page = pageSchema.parse(pageRaw);
    const where = {
      tenantId: req.actor.tenantId,
      ...(req.actor.role === 'CASHIER' ? { shift: { membershipId: req.actor.membershipId } } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
        include: { lines: true, payments: true, outlet: { select: { name: true } } },
      }),
      this.db.sale.count({ where }),
    ]);
    return {
      items: items.map((s) =>
        req.actor.role === 'CASHIER'
          ? {
              ...s,
              cost: undefined,
              requestHash: undefined,
              lines: s.lines.map((l) => ({ ...l, unitCost: undefined })),
            }
          : s,
      ),
      total,
      page,
      pageSize: 20,
    };
  }
  @Get('dashboard') async dashboard(@Req() req: AuthRequest) {
    permit(req.actor, 'catalog.write');
    const tenantId = req.actor.tenantId;
    const [sales, products, stock, recent] = await this.db.$transaction([
      this.db.sale.aggregate({
        where: { tenantId },
        _sum: { total: true, cost: true },
        _count: true,
      }),
      this.db.product.count({ where: { tenantId } }),
      this.db.stockBalance.findMany({ where: { tenantId }, include: { product: true } }),
      this.db.sale.findMany({
        where: { tenantId },
        take: 7,
        orderBy: { createdAt: 'desc' },
        select: { id: true, total: true, createdAt: true },
      }),
    ]);
    return {
      revenue: sales._sum.total || '0',
      grossProfit: (sales._sum.total || new Prisma.Decimal(0)).minus(sales._sum.cost || 0),
      saleCount: sales._count,
      productCount: products,
      inventoryValue: stock.reduce(
        (v, b) => v.plus(b.product.cost.mul(b.quantity)),
        new Prisma.Decimal(0),
      ),
      lowStock: stock
        .filter((b) => b.quantity < 10)
        .map((b) => ({ name: b.product.name, quantity: b.quantity })),
      recent,
    };
  }
}
