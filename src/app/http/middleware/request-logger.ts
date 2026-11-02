import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '@/app/http/types';
import type { Logger } from '@/app/ports/logger';

export function requestLoggerMiddleware(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const startedAt = performance.now();
    const requestId = context.get('requestId');
    const requestLogger = logger.child({ requestId });
    context.set('logger', requestLogger);

    try {
      await next();
    } finally {
      requestLogger.info('request completed', {
        method: context.req.method,
        path: context.req.path,
        status: context.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  };
}
