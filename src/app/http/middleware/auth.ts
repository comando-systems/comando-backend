import type { MiddlewareHandler } from 'hono';
import { UnauthorizedError } from '@/app/errors';
import type { AppEnv } from '@/app/http/types';
import type { TokenService } from '@/app/ports/token-service';
import { UserID } from '@/domain/value-objects/ids';

const BEARER_PREFIX = 'Bearer ';

export function authMiddleware(tokenService: TokenService): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const authorization = context.req.header('authorization');

    if (authorization === undefined || !authorization.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedError();
    }

    const token = authorization.slice(BEARER_PREFIX.length).trim();

    if (token.length === 0) {
      throw new UnauthorizedError();
    }

    const claims = await tokenService.verify(token);
    context.set('actorUserId', new UserID(claims.userId));

    await next();
  };
}
