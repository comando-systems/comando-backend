import { describe, expect, test } from 'bun:test';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/app/errors';
import {
  GetItemUseCase,
  GetSettingsUseCase,
  ListItemsUseCase,
  UpdateSettingsUseCase,
} from '@/app/use-cases';
import { Item } from '@/domain/entity/item';
import { Settings } from '@/domain/entity/settings';
import type { Repositories } from '@/domain/repository';
import type { ItemPageOptions } from '@/domain/repository/item-repository';
import { ItemID } from '@/domain/value-objects/ids';
import { fakeUnitOfWork, fakeUsers, makeUser, NOW } from '../support/fakes';

const admin = makeUser('1', ['ADMIN']);
const cashier = makeUser('2', ['CASHIER']);
const sleeper = makeUser('3', ['SERVER'], true);

const users = fakeUsers({
  findById: async (id) => [admin, cashier, sleeper].find((user) => user.id.equals(id)) ?? null,
});

function settingsRow(): Settings {
  return Settings.restore({
    serviceFeeEnabled: false,
    serviceFeeBasisPoints: 1000,
    updatedByUserId: null,
    updatedAt: NOW,
  });
}

describe('settings', () => {
  function world() {
    const current = settingsRow();
    const saved: Settings[] = [];
    const unitOfWork = fakeUnitOfWork({
      users,
      settings: {
        get: async () => current,
        save: async (settings: Settings) => {
          saved.push(settings);
        },
      },
    } as unknown as Partial<Repositories>);

    return { unitOfWork, saved };
  }

  test('every signed-in user reads them, but a deactivated user does not', async () => {
    const useCase = new GetSettingsUseCase(world().unitOfWork);

    for (const actor of [admin, cashier]) {
      await expect(useCase.execute({ actorUserId: actor.id })).resolves.toMatchObject({
        serviceFeeEnabled: false,
        serviceFeeBasisPoints: 1000,
      });
    }
    await expect(useCase.execute({ actorUserId: sleeper.id })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  test('an administrator switches the fee on and records who did it', async () => {
    const { unitOfWork, saved } = world();

    const result = await new UpdateSettingsUseCase(unitOfWork, { now: () => NOW }).execute({
      actorUserId: admin.id,
      serviceFeeEnabled: true,
      serviceFeeBasisPoints: 1250,
    });

    expect(result.serviceFeeEnabled).toBe(true);
    expect(result.serviceFeeBasisPoints).toBe(1250);
    expect(result.effectiveServiceFeeBasisPoints).toBe(1250);
    expect(result.updatedByUserId?.value).toBe('1');
    expect(saved).toHaveLength(1);
  });

  test('a partial update keeps the other field', async () => {
    const { unitOfWork } = world();

    const result = await new UpdateSettingsUseCase(unitOfWork, { now: () => NOW }).execute({
      actorUserId: admin.id,
      serviceFeeEnabled: true,
    });

    expect(result.serviceFeeBasisPoints).toBe(1000);
  });

  test('only administrators change them', async () => {
    const { unitOfWork, saved } = world();

    await expect(
      new UpdateSettingsUseCase(unitOfWork, { now: () => NOW }).execute({
        actorUserId: cashier.id,
        serviceFeeEnabled: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(saved).toHaveLength(0);
  });
});

describe('catalog visibility', () => {
  const sellable = Item.create({ id: new ItemID('1'), name: 'Coffee', priceCents: 500, now: NOW });
  const disabled = Item.create({
    id: new ItemID('2'),
    name: 'Old special',
    priceCents: 500,
    active: false,
    now: NOW,
  });

  function world() {
    const listed: ItemPageOptions[] = [];
    const unitOfWork = fakeUnitOfWork({
      users,
      items: {
        findById: async (id: ItemID) => [sellable, disabled].find((i) => i.id.equals(id)) ?? null,
        list: async (options: ItemPageOptions) => {
          listed.push(options);
          return { items: [], total: 0 };
        },
      },
    } as unknown as Partial<Repositories>);

    return { unitOfWork, listed };
  }

  test('whoever serves customers lists only what can be sold', async () => {
    const { unitOfWork, listed } = world();

    await new ListItemsUseCase(unitOfWork).execute({
      actorUserId: cashier.id,
      page: 1,
      pageSize: 20,
    });

    expect(listed[0]?.sellableOnly).toBe(true);
  });

  test('administrators also see disabled items', async () => {
    const { unitOfWork, listed } = world();

    await new ListItemsUseCase(unitOfWork).execute({
      actorUserId: admin.id,
      page: 1,
      pageSize: 20,
    });

    expect(listed[0]?.sellableOnly).toBe(false);
  });

  test('a disabled item is hidden from servers and cashiers but not from administrators', async () => {
    const { unitOfWork } = world();
    const useCase = new GetItemUseCase(unitOfWork);

    await expect(
      useCase.execute({ actorUserId: cashier.id, itemId: disabled.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCase.execute({ actorUserId: admin.id, itemId: disabled.id })).resolves.toBe(
      disabled,
    );
    await expect(useCase.execute({ actorUserId: cashier.id, itemId: sellable.id })).resolves.toBe(
      sellable,
    );
  });
});
