import { Hono } from 'hono';
import type { AppContainer } from '@/app/container';
import { NotFoundError } from '@/app/errors';
import type { AppEnv } from '@/app/http/types';

/** Public delivery of stored item images. Filenames are server-generated and validated. */
export function imageRoutes(container: AppContainer): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/items/:filename', async (context) => {
    const filename = context.req.param('filename');
    const stored =
      container.imageStorage === null ? null : await container.imageStorage.read(filename);

    if (stored === null) {
      throw new NotFoundError('Image not found');
    }

    return new Response(stored.data, {
      headers: { 'Content-Type': stored.contentType },
    });
  });

  return routes;
}
