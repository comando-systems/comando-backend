import { Hono } from 'hono';
import type { AppContainer } from '@/app/container';
import { authMiddleware } from '@/app/http/middleware/auth';
import { salesSummaryQuerySchema } from '@/app/http/schemas';
import { toSalesSummaryResponse } from '@/app/http/serializers';
import type { AppEnv } from '@/app/http/types';
import { parseQuery } from '@/app/http/validation';

export function reportRoutes(container: AppContainer): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', authMiddleware(container.tokenService));

  routes.get('/summary', async (context) => {
    const query = parseQuery(context, salesSummaryQuerySchema);
    const summary = await container.useCases.reports.salesSummary.execute({
      actorUserId: context.get('actorUserId'),
      ...query,
    });

    return context.json(toSalesSummaryResponse(summary));
  });

  return routes;
}
