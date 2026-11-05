import { ForbiddenError, UnauthorizedError } from '@/app/errors';
import type { Permission, User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

/**
 * Loads the current user from the database on every authorized operation.
 * This makes deactivation effective immediately for already-issued tokens and
 * keeps authorization inside the application layer.
 */
export async function requireActor(
  repositories: Repositories,
  userId: UserID,
  permission?: Permission,
): Promise<User> {
  const user = await repositories.users.findById(userId);

  if (user === null || !user.isActive) {
    throw new UnauthorizedError('Authentication required');
  }

  if (permission !== undefined && !user.hasPermission(permission)) {
    throw new ForbiddenError();
  }

  return user;
}
