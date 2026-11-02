import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '@/app/http/types';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function requestIdMiddleware(): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const incoming = context.req.header('x-request-id');
    const requestId =
      incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();

    context.set('requestId', requestId);
    context.header('x-request-id', requestId);

    await next();
  };
}
