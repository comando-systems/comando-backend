import type { Context } from 'hono';
import type { AppConfig } from '@/app/config';
import type { Clock } from '@/app/ports/clock';
import type { Logger } from '@/app/ports/logger';
import type { DatabaseConnection } from '@/infrastructure/database/postgres';

export interface AppContainer {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly database: DatabaseConnection;
  close(): Promise<void>;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    logger: Logger;
  };
}

export type AppContext = Context<AppEnv>;
