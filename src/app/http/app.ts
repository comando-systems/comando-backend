import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppContainer } from '@/app/container';
import { PayloadTooLargeError, ServiceUnavailableError } from '@/app/errors';
import { toErrorResponse } from '@/app/http/error-handler';
import { requestIdMiddleware } from '@/app/http/middleware/request-id';
import { requestLoggerMiddleware } from '@/app/http/middleware/request-logger';
import { securityHeadersMiddleware } from '@/app/http/middleware/security-headers';
import { buildOpenApiDocument } from '@/app/http/openapi/document';
import { authRoutes } from '@/app/http/routes/auth';
import { itemRoutes } from '@/app/http/routes/items';
import { orderRoutes } from '@/app/http/routes/orders';
import { reportRoutes } from '@/app/http/routes/reports';
import { settingsRoutes } from '@/app/http/routes/settings';
import { userRoutes } from '@/app/http/routes/users';
import type { AppEnv } from '@/app/http/types';

export function createApp(container: AppContainer): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requestIdMiddleware());
  app.use('*', requestLoggerMiddleware(container.logger));
  app.use(
    '*',
    securityHeadersMiddleware({ production: container.config.environment === 'production' }),
  );
  app.use(
    '*',
    cors({
      origin:
        container.config.corsOrigin === '*'
          ? '*'
          : container.config.corsOrigin.split(',').map((origin) => origin.trim()),
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

  if (container.config.docsEnabled) {
    const document = buildOpenApiDocument();
    app.get('/openapi.json', (context) => context.json(document));
    app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Comandô API' }));
  }

  app.route('/auth', authRoutes(container));
  app.route('/users', userRoutes(container));
  app.route('/items', itemRoutes(container));
  app.route('/orders', orderRoutes(container));
  app.route('/reports', reportRoutes(container));
  app.route('/settings', settingsRoutes(container));

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
