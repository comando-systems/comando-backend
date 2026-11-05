import { Hono } from 'hono';
import { loginRateLimitMiddleware } from '@/app/http/middleware/login-rate-limit';
import { loginBodySchema } from '@/app/http/schemas';
import { toUserResponse } from '@/app/http/serializers';
import type { AppContainer, AppEnv } from '@/app/http/types';
import { parseJson } from '@/app/http/validation';

export function authRoutes(container: AppContainer): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post(
    '/login',
    loginRateLimitMiddleware({
      maxAttempts: container.config.loginRateLimitMax,
      windowSeconds: container.config.loginRateLimitWindowSeconds,
    }),
    async (context) => {
      const body = await parseJson(context, loginBodySchema);
      const result = await container.useCases.login.execute(body);

      return context.json({
        accessToken: result.accessToken,
        expiresAt: result.expiresAt.toISOString(),
        user: toUserResponse(result.user),
      });
    },
  );

  return routes;
}
