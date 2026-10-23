import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { Database } from './database';
import type { Role } from '@prisma/client';
export type Actor = { tenantId: string; membershipId: string; userId: string; role: Role };
export type AuthRequest = Request & { actor: Actor };
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export function permit(
  actor: Actor,
  permission: 'catalog.write' | 'inventory.write' | 'sales.read' | 'pos.use',
) {
  const roles: Record<typeof permission, Role[]> = {
    'catalog.write': ['OWNER', 'SUPERVISOR'],
    'inventory.write': ['OWNER', 'SUPERVISOR'],
    'sales.read': ['OWNER', 'SUPERVISOR', 'CASHIER'],
    'pos.use': ['OWNER', 'SUPERVISOR', 'CASHIER'],
  };
  if (!roles[permission].includes(actor.role)) throw new ForbiddenException('Akses ditolak');
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Database) private readonly db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const raw = req.cookies?.session as string | undefined;
    if (!raw) throw new UnauthorizedException('Silakan masuk');
    const session = await this.db.userSession.findUnique({
      where: { tokenHash: tokenHash(raw) },
      include: { membership: { include: { tenant: true } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.membership.tenant.active)
      throw new UnauthorizedException('Sesi berakhir');
    const m = session.membership;
    req.actor = { tenantId: m.tenantId, membershipId: m.id, userId: m.userId, role: m.role };
    return true;
  }
}
