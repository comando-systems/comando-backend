import { createMiddleware } from 'hono/factory';
import { UnauthorizedError } from '@/app/errors';
import { parseRoles } from '@/domain';
import type { Auth } from '@/infrastructure/auth';
import type { AppEnv } from '../types';

// Early check only: use cases still enforce permissions.
export function authenticate(auth: Auth) {
  return createMiddleware<AppEnv>(async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });

    if (!session) {
      throw new UnauthorizedError();
    }

    context.set('principal', {
      userId: session.user.id,
      roles: parseRoles(session.user.role),
    });
    await next();
  });
}
