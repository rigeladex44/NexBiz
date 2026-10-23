import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { Database } from './database';
import { SessionGuard } from './security';
import { PosService } from './pos';
import { PublicController, BusinessController } from './controllers';
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof HttpException
          ? error.getStatus()
          : error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
            ? 409
            : 500;
    if (status === 500) logger.error({ err: error }, 'request failed');
    response
      .status(status)
      .json({
        message:
          status === 500
            ? 'Kesalahan server'
            : error instanceof ZodError
              ? error.issues.map((i) => i.message).join(', ')
              : status === 409
                ? 'Konflik data atau operasi bersamaan; periksa dan coba ulang'
                : (error as Error).message,
      });
  }
}
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: 120 },
      { name: 'burst', ttl: 1000, limit: 15 },
    ]),
  ],
  controllers: [PublicController, BusinessController],
  providers: [Database, SessionGuard, PosService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class AppModule {}
async function main() {
  if (!process.env.DATABASE_URL || !process.env.APP_ORIGIN)
    throw new Error('DATABASE_URL dan APP_ORIGIN wajib dikonfigurasi');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () =>
      logger.info(
        { requestId, method: req.method, path: req.path, status: res.statusCode },
        'http',
      ),
    );
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.get('X-Requested-With') !== 'SmartBiz' ||
        (req.get('Origin') && req.get('Origin') !== process.env.APP_ORIGIN))
    ) {
      res.status(403).json({ message: 'Permintaan tidak diizinkan' });
      return;
    }
    next();
  });
  app.useGlobalFilters(new Errors());
  await app.listen(Number(process.env.PORT || 4000), '0.0.0.0');
}
void main();
