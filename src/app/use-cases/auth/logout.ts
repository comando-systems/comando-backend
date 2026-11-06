import type { Clock } from '@/app/ports/clock';
import type { RefreshTokenCodec } from '@/app/ports/refresh-token-codec';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Repositories } from '@/domain/repository';

export interface LogoutInput {
  readonly refreshToken: string;
}

// Idempotent: an unknown or already revoked token is not an error, so a retry is harmless.
export class LogoutUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly codec: RefreshTokenCodec,
    private readonly clock: Clock,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    await this.unitOfWork.run(async (repositories) => {
      const token = await repositories.refreshTokens.findByHashForUpdate(
        this.codec.hash(input.refreshToken),
      );

      if (token !== null && token.revokedAt === null) {
        await repositories.refreshTokens.revoke(token.id, this.clock.now());
      }
    });
  }
}
