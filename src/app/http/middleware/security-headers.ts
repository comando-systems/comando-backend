import type { MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from '@/app/http/types';

const DOCS_PATHS = new Set(['/docs', '/openapi.json']);

export interface SecurityHeadersOptions {
  readonly production: boolean;
}

// The API returns JSON only, so nothing it sends may be rendered, framed, or cached. The docs UI
// loads its own scripts and styles, so it keeps the browser defaults for those two paths.
export function securityHeadersMiddleware(
  options: SecurityHeadersOptions,
): MiddlewareHandler<AppEnv> {
  const api = secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
    strictTransportSecurity: options.production ? 'max-age=63072000; includeSubDomains' : false,
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    crossOriginResourcePolicy: 'same-site',
    referrerPolicy: 'no-referrer',
  });
  const docs = secureHeaders({ contentSecurityPolicy: undefined });

  return async (context, next) => {
    if (DOCS_PATHS.has(context.req.path)) {
      return docs(context, next);
    }

    await api(context, async () => {
      await next();
      // Tokens and orders must never be stored by an intermediary or the browser.
      context.header('Cache-Control', 'no-store');
    });
  };
}
