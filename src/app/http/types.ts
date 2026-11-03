import type { Context } from 'hono';
import type { AppConfig } from '@/app/config';
import type { Clock } from '@/app/ports/clock';
import type { IdGenerator } from '@/app/ports/id-generator';
import type { Logger } from '@/app/ports/logger';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Role } from '@/domain';
import type { Repositories } from '@/domain/repository';
import type { Auth } from '@/infrastructure/auth';
import type { DatabaseConnections } from '@/infrastructure/database/connections';

export interface IdGenerators {
  readonly items: IdGenerator;
  readonly orders: IdGenerator;
}

export interface AppContainer {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly database: DatabaseConnections;
  readonly repositories: Repositories;
  readonly unitOfWork: UnitOfWork<Repositories>;
  readonly ids: IdGenerators;
  readonly auth: Auth;
  close(): Promise<void>;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    logger: Logger;
    principal: Principal;
  };
}

export interface Principal {
  readonly userId: string;
  readonly roles: readonly Role[];
}

export type AppContext = Context<AppEnv>;
