import { Hono } from 'hono';
import { authMiddleware } from '@/app/http/middleware/auth';
import {
  createUserBodySchema,
  updateUserBodySchema,
  userListQuerySchema,
} from '@/app/http/schemas';
import { toPageResponse, toUserResponse } from '@/app/http/serializers';
import type { AppContainer, AppEnv } from '@/app/http/types';
import { parseJson, parseQuery } from '@/app/http/validation';
import { UserID } from '@/domain/value-objects/ids';

export function userRoutes(container: AppContainer): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', authMiddleware(container.tokenService));

  routes.post('/', async (context) => {
    const body = await parseJson(context, createUserBodySchema);
    const user = await container.useCases.users.create.execute({
      actorUserId: context.get('actorUserId'),
      requestId: context.get('requestId'),
      ...body,
    });

    return context.json(toUserResponse(user), 201);
  });

  routes.get('/', async (context) => {
    const query = parseQuery(context, userListQuerySchema);
    const result = await container.useCases.users.list.execute({
      actorUserId: context.get('actorUserId'),
      ...query,
    });

    return context.json(
      toPageResponse(result.users, result.total, query.page, query.pageSize, toUserResponse),
    );
  });

  routes.get('/:id', async (context) => {
    const user = await container.useCases.users.get.execute({
      actorUserId: context.get('actorUserId'),
      userId: new UserID(context.req.param('id')),
    });

    return context.json(toUserResponse(user));
  });

  routes.patch('/:id', async (context) => {
    const body = await parseJson(context, updateUserBodySchema);
    const user = await container.useCases.users.update.execute({
      actorUserId: context.get('actorUserId'),
      userId: new UserID(context.req.param('id')),
      requestId: context.get('requestId'),
      ...body,
    });

    return context.json(toUserResponse(user));
  });

  routes.delete('/:id', async (context) => {
    const user = await container.useCases.users.deactivate.execute({
      actorUserId: context.get('actorUserId'),
      userId: new UserID(context.req.param('id')),
      requestId: context.get('requestId'),
    });

    return context.json(toUserResponse(user));
  });

  return routes;
}
