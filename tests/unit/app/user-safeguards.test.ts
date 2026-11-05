import { describe, expect, test } from 'bun:test';
import { ConflictError, ForbiddenError, NotFoundError } from '@/app/errors';
import type { PasswordHasher } from '@/app/ports/password-hasher';
import { DeactivateUserUseCase, UpdateUserUseCase } from '@/app/use-cases';
import type { User } from '@/domain/entity/user';
import { fakeUnitOfWork, fakeUsers, makeUser, NOW } from '../support/fakes';

const hasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  verify: async () => true,
};
const clock = { now: () => NOW };

// Every call builds its own users: the use cases mutate them, so tests must not share any.
function world(activeAdmins: number) {
  const admin = makeUser('1', ['ADMIN']);
  const otherAdmin = makeUser('2', ['ADMIN']);
  const cashier = makeUser('3', ['CASHIER']);
  const sleeper = makeUser('4', ['CASHIER'], true);
  const everyone = [admin, otherAdmin, cashier, sleeper];
  const saved: User[] = [];
  const state = { locks: 0, counts: 0 };

  const users = fakeUsers({
    findById: async (id) => everyone.find((user) => user.id.equals(id)) ?? null,
    findByEmail: async () => null,
    update: async (user) => {
      saved.push(user);
    },
    countActiveAdmins: async () => {
      state.counts += 1;
      return activeAdmins;
    },
    lockAdministration: async () => {
      state.locks += 1;
    },
  });

  return {
    unitOfWork: fakeUnitOfWork({ users }),
    saved,
    state,
    admin,
    otherAdmin,
    cashier,
    sleeper,
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
}

describe('deactivating users', () => {
  test('takes the administration lock before checking anything', async () => {
    const { unitOfWork, state, admin, cashier } = world(2);

    await new DeactivateUserUseCase(unitOfWork, clock).execute({
      actorUserId: admin.id,
      userId: cashier.id,
    });

    expect(state.locks).toBe(1);
  });

  test('deactivates an ordinary user without counting administrators', async () => {
    const { unitOfWork, state, admin } = world(1);
    const user = makeUser('3', ['CASHIER']);
    const everyone = fakeUnitOfWork({
      users: fakeUsers({
        findById: async (id) => (id.equals(admin.id) ? admin : user),
        update: async () => {},
        lockAdministration: async () => {},
        countActiveAdmins: async () => {
          state.counts += 1;
          return 1;
        },
      }),
    });

    await new DeactivateUserUseCase(everyone, clock).execute({
      actorUserId: admin.id,
      userId: user.id,
    });

    expect(user.isActive).toBe(false);
    expect(state.counts).toBe(0);
    expect(unitOfWork).toBeDefined();
  });

  test('nobody deactivates themselves', async () => {
    const { unitOfWork, admin } = world(2);

    const code = await codeOf(
      new DeactivateUserUseCase(unitOfWork, clock).execute({
        actorUserId: admin.id,
        userId: admin.id,
      }),
    );

    expect(code).toBe('CANNOT_DEACTIVATE_SELF');
  });

  test('the last active administrator cannot be deactivated', async () => {
    const { unitOfWork, admin, otherAdmin } = world(1);

    const code = await codeOf(
      new DeactivateUserUseCase(unitOfWork, clock).execute({
        actorUserId: otherAdmin.id,
        userId: admin.id,
      }),
    );

    expect(code).toBe('LAST_ADMIN');
  });

  test('another administrator can be deactivated while at least two are active', async () => {
    const { unitOfWork, saved, admin } = world(2);
    const target = makeUser('2', ['ADMIN']);
    const here = fakeUnitOfWork({
      users: fakeUsers({
        findById: async (id) => (id.equals(admin.id) ? admin : target),
        update: async (user) => {
          saved.push(user);
        },
        lockAdministration: async () => {},
        countActiveAdmins: async () => 2,
      }),
    });

    await new DeactivateUserUseCase(here, clock).execute({
      actorUserId: admin.id,
      userId: target.id,
    });

    expect(saved).toHaveLength(1);
    expect(unitOfWork).toBeDefined();
  });

  test('unknown or already deactivated users and non-administrators are refused', async () => {
    const { unitOfWork, admin, cashier, sleeper } = world(2);
    const useCase = new DeactivateUserUseCase(unitOfWork, clock);

    await expect(
      useCase.execute({ actorUserId: cashier.id, userId: admin.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      useCase.execute({ actorUserId: admin.id, userId: sleeper.id }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      useCase.execute({ actorUserId: admin.id, userId: makeUser('99', ['SERVER']).id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('updating users', () => {
  function updater(activeAdmins: number) {
    const w = world(activeAdmins);
    return { ...w, useCase: new UpdateUserUseCase(w.unitOfWork, hasher, clock) };
  }

  test('reactivates a deactivated user and applies the other edits to them', async () => {
    const { useCase, saved, admin } = updater(2);
    const target = makeUser('4', ['CASHIER'], true);
    const unitOfWork = fakeUnitOfWork({
      users: fakeUsers({
        findById: async (id) => (id.equals(admin.id) ? admin : target),
        findByEmail: async () => null,
        update: async (user) => {
          saved.push(user);
        },
        lockAdministration: async () => {},
      }),
    });
    const reactivate = new UpdateUserUseCase(unitOfWork, hasher, clock);

    const result = await reactivate.execute({
      actorUserId: admin.id,
      userId: target.id,
      isActive: true,
      name: 'Back again',
    });

    expect(result.isActive).toBe(true);
    expect(result.name).toBe('Back again');
    expect(useCase).toBeDefined();
  });

  test('a deactivated user accepts nothing but reactivation', async () => {
    const { useCase, admin, sleeper } = updater(2);

    await expect(
      useCase.execute({ actorUserId: admin.id, userId: sleeper.id, name: 'Late' }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      useCase.execute({ actorUserId: admin.id, userId: sleeper.id, isActive: false }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test('deactivates an active user when asked to', async () => {
    const { useCase, admin, cashier } = updater(2);

    const result = await useCase.execute({
      actorUserId: admin.id,
      userId: cashier.id,
      isActive: false,
    });

    expect(result.isActive).toBe(false);
  });

  test('an administrator cannot deactivate or demote themselves', async () => {
    const { useCase, admin } = updater(2);

    expect(
      await codeOf(useCase.execute({ actorUserId: admin.id, userId: admin.id, isActive: false })),
    ).toBe('CANNOT_DEACTIVATE_SELF');
    expect(
      await codeOf(useCase.execute({ actorUserId: admin.id, userId: admin.id, roles: ['SERVER'] })),
    ).toBe('CANNOT_REMOVE_OWN_ADMIN');
  });

  test('the last administrator cannot be demoted by someone else', async () => {
    const { useCase, admin, otherAdmin } = updater(1);

    const code = await codeOf(
      useCase.execute({ actorUserId: otherAdmin.id, userId: admin.id, roles: ['CASHIER'] }),
    );

    expect(code).toBe('LAST_ADMIN');
  });

  test('keeping the administrator role is never blocked', async () => {
    const { useCase, state, admin, otherAdmin } = updater(1);

    await useCase.execute({
      actorUserId: otherAdmin.id,
      userId: admin.id,
      roles: ['ADMIN', 'CASHIER'],
    });

    expect(state.counts).toBe(0);
  });
});
