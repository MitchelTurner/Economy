import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
    res.setHeader('x-request-id', requestId);
    (req as Request & { requestId?: string }).requestId = requestId;

    const started = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - started;
      // Skip noisy health probes in logs
      if (req.path === '/health' || req.path === '/health/ready') return;
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms requestId=${requestId}`,
      );
    });
    next();
  }
}
