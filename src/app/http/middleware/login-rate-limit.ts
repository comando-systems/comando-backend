import type { Context, MiddlewareHandler } from 'hono';
import { TooManyRequestsError } from '@/app/errors';
import type { AppEnv } from '@/app/http/types';

export interface LoginRateLimitOptions {
  readonly maxAttempts: number;
  readonly windowSeconds: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_CLIENTS = 10_000;

function clientKey(context: Context<AppEnv>): string {
  const forwarded = context.req.header('x-forwarded-for');
  const forwardedClient = forwarded?.split(',')[0]?.trim();

  if (forwardedClient !== undefined && forwardedClient.length > 0) {
    return forwardedClient;
  }

  return context.req.header('x-real-ip') ?? 'unknown';
}

export function loginRateLimitMiddleware(
  options: LoginRateLimitOptions,
): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, RateLimitBucket>();
  const windowMs = options.windowSeconds * 1_000;

  return async (context, next) => {
    const now = Date.now();

    if (buckets.size >= MAX_TRACKED_CLIENTS) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) {
          buckets.delete(key);
        }
      }
    }

    const key = clientKey(context);
    const bucket = buckets.get(key);

    if (bucket === undefined || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (bucket.count >= options.maxAttempts) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
      context.header('retry-after', String(retryAfterSeconds));
      throw new TooManyRequestsError();
    }

    bucket.count += 1;
    await next();
  };
}
