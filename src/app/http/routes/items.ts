import { Hono } from 'hono';
import type { AppContainer } from '@/app/container';
import { authMiddleware } from '@/app/http/middleware/auth';
import {
  createItemBodySchema,
  itemListQuerySchema,
  updateItemBodySchema,
} from '@/app/http/schemas';
import { toItemResponse, toPageResponse } from '@/app/http/serializers';
import type { AppEnv } from '@/app/http/types';
import { parseJson, parseQuery } from '@/app/http/validation';
import { ItemID } from '@/domain/value-objects/ids';

export function itemRoutes(container: AppContainer): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', authMiddleware(container.tokenService));

  routes.post('/', async (context) => {
    const body = await parseJson(context, createItemBodySchema);
    const item = await container.useCases.items.create.execute({
      requestId: context.get('requestId'),
      actorUserId: context.get('actorUserId'),
      ...body,
    });

    return context.json(toItemResponse(item), 201);
  });

  routes.get('/', async (context) => {
    const query = parseQuery(context, itemListQuerySchema);
    const result = await container.useCases.items.list.execute({
      actorUserId: context.get('actorUserId'),
      ...query,
    });

    return context.json(
      toPageResponse(result.items, result.total, query.page, query.pageSize, toItemResponse),
    );
  });

  routes.get('/:id', async (context) => {
    const item = await container.useCases.items.get.execute({
      actorUserId: context.get('actorUserId'),
      itemId: new ItemID(context.req.param('id')),
    });

    return context.json(toItemResponse(item));
  });

  routes.patch('/:id', async (context) => {
    const body = await parseJson(context, updateItemBodySchema);
    const item = await container.useCases.items.update.execute({
      requestId: context.get('requestId'),
      actorUserId: context.get('actorUserId'),
      itemId: new ItemID(context.req.param('id')),
      ...body,
    });

    return context.json(toItemResponse(item));
  });

  routes.delete('/:id', async (context) => {
    const item = await container.useCases.items.remove.execute({
      requestId: context.get('requestId'),
      actorUserId: context.get('actorUserId'),
      itemId: new ItemID(context.req.param('id')),
    });

    return context.json(toItemResponse(item));
  });

  return routes;
}
