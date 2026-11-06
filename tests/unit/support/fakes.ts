import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Role } from '@/domain/entity/user';
import { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import type { OrderRepository } from '@/domain/repository/order-repository';
import type { RefreshTokenRepository } from '@/domain/repository/refresh-token-repository';
import type { UserRepository } from '@/domain/repository/user-repository';
import { UserID } from '@/domain/value-objects/ids';

export const NOW = new Date('2026-01-01T12:00:00.000Z');

// A unit of work that hands the same fake repositories to every callback. Only the repository
// boundary is faked; the use case under test is always the real one.
export function fakeUnitOfWork(repositories: Partial<Repositories>): UnitOfWork<Repositories> {
  // Refresh tokens are a side effect most flows share (deactivation revokes them), so they
  // default to a no-op instead of failing every test that does not care about them.
  const full = { refreshTokens: noRefreshTokens, ...repositories } as Repositories;

  return {
    run: (work) => work(full),
    read: (work) => work(full),
  };
}

export function makeUser(id: string, roles: readonly Role[], deactivate = false): User {
  const user = User.create({
    id: new UserID(id),
    name: `User ${id}`,
    email: `user-${id}@example.com`,
    passwordHash: 'hash',
    roles,
    now: NOW,
  });

  if (deactivate) {
    user.deactivate(NOW);
  }

  return user;
}

const noRefreshTokens: RefreshTokenRepository = {
  create: async () => {},
  findByHashForUpdate: async () => null,
  revoke: async () => {},
  revokeAllForUser: async () => {},
};

const unused = async (): Promise<never> => {
  throw new Error('This fake repository method is not used by the test');
};

export function fakeUsers(overrides: Partial<UserRepository>): UserRepository {
  return {
    findById: unused,
    findByEmail: unused,
    create: unused,
    update: unused,
    list: unused,
    countActiveAdmins: unused,
    lockAdministration: async () => {},
    ...overrides,
  };
}

export function fakeOrders(overrides: Partial<OrderRepository>): OrderRepository {
  return {
    create: unused,
    findById: unused,
    save: unused,
    list: unused,
    ...overrides,
    // The table lookup is renamed in another change, so it is left to the overrides.
  } as OrderRepository;
}
