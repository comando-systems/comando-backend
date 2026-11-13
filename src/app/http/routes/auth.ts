import { Hono } from 'hono';
import type { AppContainer } from '@/app/container';
import { loginRateLimitMiddleware } from '@/app/http/middleware/login-rate-limit';
import { loginBodySchema, refreshBodySchema } from '@/app/http/schemas';
import { toSessionResponse } from '@/app/http/serializers';
import type { AppEnv } from '@/app/http/types';
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

      return context.json(toSessionResponse(result));
    },
  );

  // Shares the login limiter: a stolen token can be guessed no faster than a password.
  routes.post(
    '/refresh',
    loginRateLimitMiddleware({
      maxAttempts: container.config.loginRateLimitMax,
      windowSeconds: container.config.loginRateLimitWindowSeconds,
    }),
    async (context) => {
      const body = await parseJson(context, refreshBodySchema);
      return context.json(toSessionResponse(await container.useCases.refresh.execute(body)));
    },
  );

  routes.post('/logout', async (context) => {
    const body = await parseJson(context, refreshBodySchema);
    await container.useCases.logout.execute(body);
    return context.body(null, 204);
  });

  return routes;
}
