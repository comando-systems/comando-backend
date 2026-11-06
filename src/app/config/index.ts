import { z } from 'zod';

const environmentSchema = z.enum(['development', 'test', 'production']);
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'must be a PostgreSQL connection string',
  });

const configSchema = z
  .object({
    NODE_ENV: environmentSchema.default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_READ_URL: postgresUrl,
    DATABASE_WRITE_URL: postgresUrl,
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must have at least 32 characters'),
    JWT_ISSUER: z.string().min(1).default('comando'),
    JWT_AUDIENCE: z.string().min(1).default('comando-api'),
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3_600).max(7_776_000).default(2_592_000),
    // Server processes sharing the port. Each opens its own database pools.
    WEB_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(1),
    // How long list totals are reused (ms). 0 counts on every request.
    LIST_COUNT_CACHE_TTL_MS: z.coerce.number().int().min(0).max(60_000).default(2_000),
    CORS_ORIGIN: z.string().min(1).default('*'),
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(10_485_760).default(1_048_576),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(10),
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),
    LOG_LEVEL: logLevelSchema.default('info'),
    // Empty counts as unset (Compose passes an empty string). Unset means on outside production.
    API_DOCS_ENABLED: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['true', 'false']).optional(),
    ),
  })
  .superRefine((value, context) => {
    // A wildcard origin is fine for local work but not for a deployed API.
    if (value.NODE_ENV === 'production' && value.CORS_ORIGIN === '*') {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'CORS_ORIGIN must list explicit origins in production',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;

export interface AppConfig {
  readonly environment: Environment;
  readonly host: string;
  readonly port: number;
  readonly databaseReadUrl: string;
  readonly databaseWriteUrl: string;
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly jwtExpiresInSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly webConcurrency: number;
  readonly listCountCacheTtlMs: number;
  readonly corsOrigin: string;
  readonly bodyLimitBytes: number;
  readonly loginRateLimitMax: number;
  readonly loginRateLimitWindowSeconds: number;
  readonly logLevel: LogLevel;
  // Serves /docs and /openapi.json without authentication.
  readonly docsEnabled: boolean;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function loadConfig(
  environment: Record<string, string | undefined> = process.env,
): AppConfig {
  const parsed = configSchema.safeParse(environment);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new ConfigurationError(`Invalid environment configuration: ${details}`);
  }

  const value = parsed.data;

  return Object.freeze({
    environment: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    databaseReadUrl: value.DATABASE_READ_URL,
    databaseWriteUrl: value.DATABASE_WRITE_URL,
    jwtSecret: value.JWT_SECRET,
    jwtIssuer: value.JWT_ISSUER,
    jwtAudience: value.JWT_AUDIENCE,
    jwtExpiresInSeconds: value.JWT_EXPIRES_IN_SECONDS,
    refreshTokenTtlSeconds: value.REFRESH_TOKEN_TTL_SECONDS,
    webConcurrency: value.WEB_CONCURRENCY,
    listCountCacheTtlMs: value.LIST_COUNT_CACHE_TTL_MS,
    corsOrigin: value.CORS_ORIGIN,
    bodyLimitBytes: value.BODY_LIMIT_BYTES,
    loginRateLimitMax: value.LOGIN_RATE_LIMIT_MAX,
    loginRateLimitWindowSeconds: value.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    logLevel: value.LOG_LEVEL,
    docsEnabled:
      value.API_DOCS_ENABLED === undefined
        ? value.NODE_ENV !== 'production'
        : value.API_DOCS_ENABLED === 'true',
  });
}
