import type { AppConfig } from '@/app/config';
import type { AppContainer } from '@/app/http/types';
import { systemClock } from '@/app/ports/clock';
import { createDatabaseConnection } from '@/infrastructure/database/postgres';
import { JsonLogger } from '@/infrastructure/logging/json-logger';

export function createContainer(config: AppConfig): AppContainer {
  const logger = new JsonLogger(config.logLevel, { service: 'comando-api' });
  const database = createDatabaseConnection(config.databaseUrl, logger);

  return {
    config,
    logger,
    clock: systemClock,
    database,
    async close(): Promise<void> {
      await database.close();
    },
  };
}
