import type { AppConfig } from '@/app/config';
import type { AppContainer, IdGenerators } from '@/app/http/types';
import { systemClock } from '@/app/ports/clock';
import type { UseCases } from '@/app/use-cases';
import {
  CreateUserUseCase,
  DeactivateUserUseCase,
  GetUserUseCase,
  ListUsersUseCase,
  LoginUseCase,
  UpdateUserUseCase,
} from '@/app/use-cases';
import { BunPasswordHasher, JwtTokenService } from '@/infrastructure/authentication';
import { createDatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { JsonLogger } from '@/infrastructure/logging/json-logger';
import { createRepositories } from '@/infrastructure/repositories';

function createUseCases(container: {
  unitOfWork: AppContainer['unitOfWork'];
  passwordHasher: AppContainer['passwordHasher'];
  tokenService: AppContainer['tokenService'];
  clock: AppContainer['clock'];
}): UseCases {
  return {
    login: new LoginUseCase(container.unitOfWork, container.passwordHasher, container.tokenService),
    users: {
      create: new CreateUserUseCase(
        container.unitOfWork,
        container.passwordHasher,
        container.clock,
      ),
      update: new UpdateUserUseCase(
        container.unitOfWork,
        container.passwordHasher,
        container.clock,
      ),
      deactivate: new DeactivateUserUseCase(container.unitOfWork, container.clock),
      list: new ListUsersUseCase(container.unitOfWork),
      get: new GetUserUseCase(container.unitOfWork),
    },
  };
}

export function createContainer(config: AppConfig): AppContainer {
  const logger = new JsonLogger(config.logLevel, { service: 'comando-api' });
  const database = createDatabaseConnections(
    config.databaseReadUrl,
    config.databaseWriteUrl,
    logger,
  );
  const repositories = createRepositories(database);
  const unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
  const clock = systemClock;
  const passwordHasher = new BunPasswordHasher();
  const tokenService = new JwtTokenService({
    secret: config.jwtSecret,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresInSeconds: config.jwtExpiresInSeconds,
    clock,
  });

  const ids: IdGenerators = {
    orders: new SequenceIdGenerator(database.write, 'orders_id_seq'),
  };

  const useCases = createUseCases({
    unitOfWork,
    passwordHasher,
    tokenService,
    clock,
  });

  return {
    config,
    logger,
    clock,
    database,
    repositories,
    unitOfWork,
    ids,
    passwordHasher,
    tokenService,
    useCases,
    async close(): Promise<void> {
      await database.close();
    },
  };
}
