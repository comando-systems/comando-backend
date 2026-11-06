import type { AppConfig } from '@/app/config';
import type { Clock } from '@/app/ports/clock';
import type { IdGenerator } from '@/app/ports/id-generator';
import type { Logger } from '@/app/ports/logger';
import type { PasswordHasher } from '@/app/ports/password-hasher';
import type { RefreshTokenCodec } from '@/app/ports/refresh-token-codec';
import type { TokenService } from '@/app/ports/token-service';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { UseCases } from '@/app/use-cases';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';

export interface IdGenerators {
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
  readonly passwordHasher: PasswordHasher;
  readonly tokenService: TokenService;
  readonly refreshTokenCodec: RefreshTokenCodec;
  readonly useCases: UseCases;
  close(): Promise<void>;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    logger: Logger;
    actorUserId: UserID;
  };
}
