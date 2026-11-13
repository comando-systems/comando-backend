import type { Logger } from '@/app/ports/logger';
import type { UserID } from '@/domain/value-objects/ids';

export interface AppEnv {
  Variables: {
    requestId: string;
    logger: Logger;
    actorUserId: UserID;
  };
}
