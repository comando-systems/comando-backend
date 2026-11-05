import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { requireActor } from '@/app/authorization';
import { ConflictError, ForbiddenError, UnauthorizedError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import {
  CreateUserUseCase,
  DeactivateUserUseCase,
  GetUserUseCase,
  ListUsersUseCase,
  LoginUseCase,
  UpdateUserUseCase,
} from '@/app/use-cases';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import { BunPasswordHasher, JwtTokenService } from '@/infrastructure/authentication';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const now = new Date('2026-01-01T12:00:00.000Z');

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1_000);
  }
}

describe.skipIf(!TEST_DATABASE_URL)('authentication and user administration', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;
  let unitOfWork: DatabaseUnitOfWork;
  let passwordHasher: BunPasswordHasher;
  let tokenService: JwtTokenService;
  let clock: MutableClock;
  let login: LoginUseCase;
  let createUser: CreateUserUseCase;
  let updateUser: UpdateUserUseCase;
  let deactivateUser: DeactivateUserUseCase;
  let listUsers: ListUsersUseCase;
  let getUser: GetUserUseCase;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
    unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
    passwordHasher = new BunPasswordHasher();
    clock = new MutableClock(now);
    tokenService = new JwtTokenService({
      secret: 'a'.repeat(32),
      issuer: 'comando',
      audience: 'comando-api',
      expiresInSeconds: 900,
      clock,
    });
    login = new LoginUseCase(unitOfWork, passwordHasher, tokenService);
    createUser = new CreateUserUseCase(unitOfWork, passwordHasher, clock);
    updateUser = new UpdateUserUseCase(unitOfWork, passwordHasher, clock);
    deactivateUser = new DeactivateUserUseCase(unitOfWork, clock);
    listUsers = new ListUsersUseCase(unitOfWork);
    getUser = new GetUserUseCase(unitOfWork);
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  afterAll(async () => {
    await database.close();
  });

  async function createAdmin(password = 'admin-password'): Promise<User> {
    return unitOfWork.run(async (repos) =>
      repos.users.create({
        name: 'Admin',
        email: `admin-${crypto.randomUUID()}@example.com`,
        passwordHash: await passwordHasher.hash(password),
        roles: ['ADMIN'],
        now,
      }),
    );
  }

  test('creates a user and authenticates with a JWT access token', async () => {
    const admin = await createAdmin();
    const created = await createUser.execute({
      actorUserId: admin.id,
      name: 'Ada Lovelace',
      email: 'ADA@example.com',
      password: 'server-password',
      roles: ['SERVER'],
    });

    expect(created.email).toBe('ada@example.com');
    expect(created.passwordHash).not.toBe('server-password');

    const result = await login.execute({
      email: 'ADA@example.com',
      password: 'server-password',
    });
    const claims = await tokenService.verify(result.accessToken);

    expect(result.user.id.value).toBe(created.id.value);
    expect(claims.userId).toBe(created.id.value);
    expect(claims.expiresAt).toEqual(new Date('2026-01-01T12:15:00.000Z'));
  });

  test('rejects invalid credentials and disabled users', async () => {
    const admin = await createAdmin();
    const created = await createUser.execute({
      actorUserId: admin.id,
      name: 'Grace Hopper',
      email: 'grace@example.com',
      password: 'server-password',
      roles: ['SERVER'],
    });

    await expect(
      login.execute({ email: 'grace@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await deactivateUser.execute({ actorUserId: admin.id, userId: created.id });

    await expect(
      login.execute({ email: 'grace@example.com', password: 'server-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await expect(
      unitOfWork.read((repos) => requireActor(repos, created.id)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test('denies user administration to non-admin roles', async () => {
    const admin = await createAdmin();
    const cashier = await createUser.execute({
      actorUserId: admin.id,
      name: 'Cashier',
      email: 'cashier@example.com',
      password: 'cashier-password',
      roles: ['CASHIER'],
    });

    await expect(
      createUser.execute({
        actorUserId: cashier.id,
        name: 'Nope',
        email: 'nope@example.com',
        password: 'nope-password',
        roles: ['SERVER'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test('updates profile, roles, and password and rejects duplicate emails', async () => {
    const admin = await createAdmin();
    const first = await createUser.execute({
      actorUserId: admin.id,
      name: 'First',
      email: 'first@example.com',
      password: 'first-password',
      roles: ['SERVER'],
    });
    await createUser.execute({
      actorUserId: admin.id,
      name: 'Second',
      email: 'second@example.com',
      password: 'second-password',
      roles: ['CASHIER'],
    });

    const updated = await updateUser.execute({
      actorUserId: admin.id,
      userId: first.id,
      name: 'Updated',
      email: 'updated@example.com',
      password: 'new-password',
      roles: ['CASHIER', 'SERVER'],
    });

    expect(updated.name).toBe('Updated');
    expect(updated.roles).toEqual(['CASHIER', 'SERVER']);

    await expect(
      updateUser.execute({
        actorUserId: admin.id,
        userId: first.id,
        email: 'second@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const result = await login.execute({
      email: 'updated@example.com',
      password: 'new-password',
    });
    expect(result.user.id.value).toBe(first.id.value);
  });

  test('lists and reads users with pagination', async () => {
    const admin = await createAdmin();
    await createUser.execute({
      actorUserId: admin.id,
      name: 'Second',
      email: 'second@example.com',
      password: 'second-password',
      roles: ['CASHIER'],
    });

    const page = await listUsers.execute({ actorUserId: admin.id, page: 1, pageSize: 20 });
    expect(page.total).toBe(2);
    expect(page.users).toHaveLength(2);

    const found = await getUser.execute({ actorUserId: admin.id, userId: admin.id });
    expect(found.id.value).toBe(admin.id.value);
  });

  test('rejects duplicate emails on creation', async () => {
    const admin = await createAdmin();
    await createUser.execute({
      actorUserId: admin.id,
      name: 'Duplicate',
      email: 'duplicate@example.com',
      password: 'duplicate-password',
      roles: ['SERVER'],
    });

    await expect(
      createUser.execute({
        actorUserId: admin.id,
        name: 'Duplicate Again',
        email: 'DUPLICATE@example.com',
        password: 'duplicate-password',
        roles: ['SERVER'],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
