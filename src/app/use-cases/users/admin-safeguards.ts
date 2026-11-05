import { ConflictError } from '@/app/errors';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';

/**
 * An administrator can lock everyone out by accident, so two rules protect the system: nobody
 * deactivates or demotes themselves, and the last active administrator can never be removed.
 * Callers hold `lockAdministration` so concurrent changes cannot both pass the count.
 */
export async function assertCanRemoveAdministrator(
  repositories: Repositories,
  actor: User,
  target: User,
  change: 'deactivate' | 'demote',
): Promise<void> {
  if (!target.hasRole('ADMIN') || !target.isActive) {
    return;
  }

  if (actor.id.equals(target.id)) {
    throw change === 'deactivate'
      ? new ConflictError('You cannot deactivate yourself', { code: 'CANNOT_DEACTIVATE_SELF' })
      : new ConflictError('You cannot remove your own administrator role', {
          code: 'CANNOT_REMOVE_OWN_ADMIN',
        });
  }

  if ((await repositories.users.countActiveAdmins()) <= 1) {
    throw new ConflictError('The last active administrator cannot be removed', {
      code: 'LAST_ADMIN',
    });
  }
}
