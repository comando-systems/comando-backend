import type { AppConfig } from '@/app/config';
import type { AppContainer, IdGenerators } from '@/app/http/types';
import { systemClock } from '@/app/ports/clock';
import { createAuth } from '@/infrastructure/auth';
import { createDatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { JsonLogger } from '@/infrastructure/logging/json-logger';
import { createRepositories } from '@/infrastructure/repositories';

export function createContainer(config: AppConfig): AppContainer {
  const logger = new JsonLogger(config.logLevel, { service: 'comando-api' });
  const database = createDatabaseConnections(
    config.databaseReadUrl,
    config.databaseWriteUrl,
    logger,
  );
  const repositories = createRepositories(database);

  const ids: IdGenerators = {
    items: new SequenceIdGenerator(database.write, 'items_id_seq'),
    orders: new SequenceIdGenerator(database.write, 'orders_id_seq'),
  };

  const { auth, close: closeAuth } = createAuth(config);

  return {
    config,
    logger,
    clock: systemClock,
    database,
    repositories,
    unitOfWork: new DatabaseUnitOfWork(database, () => repositories),
    ids,
    auth,
    async close(): Promise<void> {
      await closeAuth();
      await database.close();
    },
  };
}
