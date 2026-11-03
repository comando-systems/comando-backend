import { z } from 'zod';

const environmentSchema = z.enum(['development', 'test', 'production']);
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'must be a PostgreSQL connection string',
  });

const configSchema = z.object({
  NODE_ENV: environmentSchema.default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_READ_URL: postgresUrl,
  DATABASE_WRITE_URL: postgresUrl,
  CORS_ORIGIN: z.string().min(1).default('*'),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(10_485_760).default(1_048_576),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(10),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86_400).default(60),
  LOG_LEVEL: logLevelSchema.default('info'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must have at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  APP_SCHEME: z.string().min(1).default('comando'),
});

export type Environment = z.infer<typeof environmentSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;

export interface AppConfig {
  readonly environment: Environment;
  readonly host: string;
  readonly port: number;
  readonly databaseReadUrl: string;
  readonly databaseWriteUrl: string;
  readonly corsOrigin: string;
  readonly bodyLimitBytes: number;
  readonly loginRateLimitMax: number;
  readonly loginRateLimitWindowSeconds: number;
  readonly logLevel: LogLevel;
  readonly authSecret: string;
  readonly authUrl: string;
  readonly appScheme: string;
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
    corsOrigin: value.CORS_ORIGIN,
    bodyLimitBytes: value.BODY_LIMIT_BYTES,
    loginRateLimitMax: value.LOGIN_RATE_LIMIT_MAX,
    loginRateLimitWindowSeconds: value.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    logLevel: value.LOG_LEVEL,
    authSecret: value.BETTER_AUTH_SECRET,
    authUrl: value.BETTER_AUTH_URL,
    appScheme: value.APP_SCHEME,
  });
}
