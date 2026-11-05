import { Hono } from 'hono';
import { authMiddleware } from '@/app/http/middleware/auth';
import {
  addOrderItemsBodySchema,
  changeOrderItemQuantityBodySchema,
  closeOrderBodySchema,
  createCounterOrderBodySchema,
  openTableOrderBodySchema,
  orderListQuerySchema,
} from '@/app/http/schemas';
import { toOrderResponse, toPageResponse } from '@/app/http/serializers';
import type { AppContainer, AppEnv } from '@/app/http/types';
import { parseJson, parseQuery } from '@/app/http/validation';
import { ItemID, OrderID } from '@/domain/value-objects/ids';

export function orderRoutes(container: AppContainer): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', authMiddleware(container.tokenService));

  routes.post('/counter', async (context) => {
    const body = await parseJson(context, createCounterOrderBodySchema);
    const order = await container.useCases.orders.createCounter.execute({
      actorUserId: context.get('actorUserId'),
      lines: body.items.map((line) => ({
        itemId: new ItemID(line.itemId),
        quantity: line.quantity,
      })),
      payments: body.payments,
    });

    return context.json(toOrderResponse(order), 201);
  });

  routes.post('/table', async (context) => {
    const body = await parseJson(context, openTableOrderBodySchema);
    const order = await container.useCases.orders.openTable.execute({
      actorUserId: context.get('actorUserId'),
      tableCode: body.tableCode,
    });

    return context.json(toOrderResponse(order), 201);
  });

  routes.get('/', async (context) => {
    const query = parseQuery(context, orderListQuerySchema);
    const result = await container.useCases.orders.list.execute({
      actorUserId: context.get('actorUserId'),
      ...query,
    });

    return context.json(
      toPageResponse(result.orders, result.total, query.page, query.pageSize, toOrderResponse),
    );
  });

  routes.get('/:id', async (context) => {
    const order = await container.useCases.orders.get.execute({
      actorUserId: context.get('actorUserId'),
      orderId: new OrderID(context.req.param('id')),
    });

    return context.json(toOrderResponse(order));
  });

  routes.post('/:id/items', async (context) => {
    const body = await parseJson(context, addOrderItemsBodySchema);
    const order = await container.useCases.orders.addItems.execute({
      actorUserId: context.get('actorUserId'),
      orderId: new OrderID(context.req.param('id')),
      lines: body.items.map((line) => ({
        itemId: new ItemID(line.itemId),
        quantity: line.quantity,
      })),
    });

    return context.json(toOrderResponse(order));
  });

  routes.patch('/:id/items/:itemId', async (context) => {
    const body = await parseJson(context, changeOrderItemQuantityBodySchema);
    const order = await container.useCases.orders.changeItemQuantity.execute({
      actorUserId: context.get('actorUserId'),
      orderId: new OrderID(context.req.param('id')),
      itemId: new ItemID(context.req.param('itemId')),
      quantity: body.quantity,
    });

    return context.json(toOrderResponse(order));
  });

  routes.post('/:id/close', async (context) => {
    const body = await parseJson(context, closeOrderBodySchema);
    const order = await container.useCases.orders.close.execute({
      actorUserId: context.get('actorUserId'),
      orderId: new OrderID(context.req.param('id')),
      payments: body.payments,
    });

    return context.json(toOrderResponse(order));
  });

  routes.post('/:id/cancel', async (context) => {
    const order = await container.useCases.orders.cancel.execute({
      actorUserId: context.get('actorUserId'),
      orderId: new OrderID(context.req.param('id')),
    });

    return context.json(toOrderResponse(order));
  });

  return routes;
}
