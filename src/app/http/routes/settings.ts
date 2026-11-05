import { Hono } from 'hono';
import { authMiddleware } from '@/app/http/middleware/auth';
import { updateSettingsBodySchema } from '@/app/http/schemas';
import { toSettingsResponse } from '@/app/http/serializers';
import type { AppContainer, AppEnv } from '@/app/http/types';
import { parseJson } from '@/app/http/validation';

export function settingsRoutes(container: AppContainer): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', authMiddleware(container.tokenService));

  routes.get('/', async (context) => {
    const settings = await container.useCases.settings.get.execute({
      actorUserId: context.get('actorUserId'),
    });

    return context.json(toSettingsResponse(settings));
  });

  routes.put('/', async (context) => {
    const body = await parseJson(context, updateSettingsBodySchema);
    const settings = await container.useCases.settings.update.execute({
      actorUserId: context.get('actorUserId'),
      ...body,
    });

    return context.json(toSettingsResponse(settings));
  });

  return routes;
}
