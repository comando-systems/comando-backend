import type { AppConfig } from '@/app/config';
import type { AppContainer, IdGenerators } from '@/app/http/types';
import { systemClock } from '@/app/ports/clock';
import type { UseCases } from '@/app/use-cases';
import {
  AddOrderItemsUseCase,
  CancelOrderUseCase,
  ChangeOrderItemQuantityUseCase,
  CloseOrderUseCase,
  CreateCounterOrderUseCase,
  CreateItemUseCase,
  CreateUserUseCase,
  DeactivateUserUseCase,
  GetItemUseCase,
  GetOrderUseCase,
  GetSalesSummaryUseCase,
  GetSettingsUseCase,
  GetUserUseCase,
  ListItemsUseCase,
  ListOrdersUseCase,
  ListUsersUseCase,
  LoginUseCase,
  LogoutUseCase,
  OpenTableOrderUseCase,
  RefreshSessionUseCase,
  RemoveItemUseCase,
  RemoveOrderItemUseCase,
  ReopenOrderUseCase,
  RequestOrderPaymentUseCase,
  SessionIssuer,
  SetOrderPricingUseCase,
  UpdateItemUseCase,
  UpdateSettingsUseCase,
  UpdateUserUseCase,
} from '@/app/use-cases';
import {
  BunPasswordHasher,
  JwtTokenService,
  RandomRefreshTokenCodec,
} from '@/infrastructure/authentication';
import { createDatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { JsonLogger } from '@/infrastructure/logging/json-logger';
import { createRepositories } from '@/infrastructure/repositories';

function createUseCases(container: {
  unitOfWork: AppContainer['unitOfWork'];
  passwordHasher: AppContainer['passwordHasher'];
  tokenService: AppContainer['tokenService'];
  refreshTokenCodec: AppContainer['refreshTokenCodec'];
  refreshTokenTtlSeconds: number;
  ids: IdGenerators;
  clock: AppContainer['clock'];
}): UseCases {
  const sessions = new SessionIssuer(
    container.tokenService,
    container.refreshTokenCodec,
    container.clock,
    container.refreshTokenTtlSeconds,
  );

  return {
    login: new LoginUseCase(container.unitOfWork, container.passwordHasher, sessions),
    refresh: new RefreshSessionUseCase(
      container.unitOfWork,
      container.refreshTokenCodec,
      sessions,
      container.clock,
    ),
    logout: new LogoutUseCase(container.unitOfWork, container.refreshTokenCodec, container.clock),
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
    items: {
      create: new CreateItemUseCase(container.unitOfWork, container.clock),
      update: new UpdateItemUseCase(container.unitOfWork, container.clock),
      remove: new RemoveItemUseCase(container.unitOfWork, container.clock),
      list: new ListItemsUseCase(container.unitOfWork),
      get: new GetItemUseCase(container.unitOfWork),
    },
    orders: {
      createCounter: new CreateCounterOrderUseCase(
        container.unitOfWork,
        container.ids.orders,
        container.clock,
      ),
      openTable: new OpenTableOrderUseCase(
        container.unitOfWork,
        container.ids.orders,
        container.clock,
      ),
      addItems: new AddOrderItemsUseCase(container.unitOfWork, container.clock),
      changeItemQuantity: new ChangeOrderItemQuantityUseCase(container.unitOfWork, container.clock),
      removeItem: new RemoveOrderItemUseCase(container.unitOfWork, container.clock),
      setPricing: new SetOrderPricingUseCase(container.unitOfWork, container.clock),
      requestPayment: new RequestOrderPaymentUseCase(container.unitOfWork, container.clock),
      reopen: new ReopenOrderUseCase(container.unitOfWork, container.clock),
      close: new CloseOrderUseCase(container.unitOfWork, container.clock),
      cancel: new CancelOrderUseCase(container.unitOfWork, container.clock),
      list: new ListOrdersUseCase(container.unitOfWork),
      get: new GetOrderUseCase(container.unitOfWork),
    },
    reports: {
      salesSummary: new GetSalesSummaryUseCase(container.unitOfWork, container.clock),
    },
    settings: {
      get: new GetSettingsUseCase(container.unitOfWork),
      update: new UpdateSettingsUseCase(container.unitOfWork, container.clock),
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
  const repositories = createRepositories(database, {
    countCacheTtlMs: config.listCountCacheTtlMs,
  });
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

  const refreshTokenCodec = new RandomRefreshTokenCodec();

  const ids: IdGenerators = {
    orders: new SequenceIdGenerator(() => database.writeSql(), 'orders_id_seq'),
  };

  const useCases = createUseCases({
    unitOfWork,
    passwordHasher,
    tokenService,
    refreshTokenCodec,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
    ids,
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
    refreshTokenCodec,
    useCases,
    async close(): Promise<void> {
      await database.close();
    },
  };
}
