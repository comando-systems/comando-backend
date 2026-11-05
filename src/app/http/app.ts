import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { PayloadTooLargeError, ServiceUnavailableError } from '@/app/errors';
import { toErrorResponse } from '@/app/http/error-handler';
import { requestIdMiddleware } from '@/app/http/middleware/request-id';
import { requestLoggerMiddleware } from '@/app/http/middleware/request-logger';
import { authRoutes } from '@/app/http/routes/auth';
import { itemRoutes } from '@/app/http/routes/items';
import { orderRoutes } from '@/app/http/routes/orders';
import { userRoutes } from '@/app/http/routes/users';
import type { AppContainer, AppEnv } from '@/app/http/types';

export function createApp(container: AppContainer): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requestIdMiddleware());
  app.use('*', requestLoggerMiddleware(container.logger));
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: container.config.corsOrigin === '*' ? '*' : container.config.corsOrigin,
      allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  app.use(
    '*',
    bodyLimit({
      maxSize: container.config.bodyLimitBytes,
      onError: () => {
        throw new PayloadTooLargeError();
      },
    }),
  );

  app.get('/health', (context) => context.json({ status: 'ok' }));

  app.get('/health/ready', async (context) => {
    try {
      await container.database.ping();
      return context.json({ status: 'ok' });
    } catch (error) {
      context.get('logger').warn('readiness check failed', { error });
      throw new ServiceUnavailableError();
    }
  });

  app.route('/auth', authRoutes(container));
  app.route('/users', userRoutes(container));
  app.route('/items', itemRoutes(container));
  app.route('/orders', orderRoutes(container));

  app.notFound((context) =>
    context.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: context.get('requestId'),
        },
      },
      404,
    ),
  );

  app.onError((error, context) => {
    const { status, body } = toErrorResponse(
      error,
      context.get('requestId'),
      context.get('logger') ?? container.logger,
    );
    return context.json(body, status as ContentfulStatusCode);
  });

  return app;
}
