// Maintenance job: removes refresh tokens that already expired so the table does not grow without
// bound. Run it from an external scheduler; the API never triggers it.
import { createContainer } from '../src/app/container';

const container = createContainer();

try {
  const removed = await container.unitOfWork.run((repositories) =>
    repositories.refreshTokens.deleteExpired(container.clock.now()),
  );

  process.stdout.write(`Removed ${removed} expired refresh token(s)\n`);
} finally {
  await container.close();
}
