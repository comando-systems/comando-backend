import { describe, expect, test } from 'bun:test';
import { ServiceUnavailableError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { ImageStorage, SavedImage, StoredImage } from '@/app/ports/image-storage';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { RemoveItemImageUseCase, UploadItemImageUseCase } from '@/app/use-cases/items';
import type { Item } from '@/domain/entity/item';
import { Item as ItemEntity } from '@/domain/entity/item';
import { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import { ItemID, UserID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');
const clock: Clock = { now: () => now };
const adminId = new UserID('1');
const itemId = new ItemID('7');

function makeItem(imageUrl: string | null = null): Item {
  return ItemEntity.create({ id: itemId, name: 'Espresso', priceCents: 750, imageUrl, now });
}

function fakeStorage() {
  const files = new Map<string, StoredImage>();
  const removed: string[] = [];
  let sequence = 0;

  const storage: ImageStorage = {
    async save(_itemId: string, image: StoredImage): Promise<SavedImage> {
      sequence += 1;
      const filename = `7-file-${sequence}.png`;
      files.set(filename, image);
      return { filename, url: `/images/items/${filename}` };
    },
    async read(filename: string) {
      return files.get(filename) ?? null;
    },
    async remove(filename: string) {
      removed.push(filename);
      files.delete(filename);
    },
    publicUrl: (filename: string) => `/images/items/${filename}`,
    filenameFromUrl: (url: string) => {
      const prefix = '/images/items/';
      return url.startsWith(prefix) ? url.slice(prefix.length) : null;
    },
  };

  return { storage, removed, files };
}

function fakeUnitOfWork(
  item: Item,
  options: { failUpdate?: boolean } = {},
): { unitOfWork: UnitOfWork<Repositories>; updates: Item[]; auditActions: string[] } {
  const updates: Item[] = [];
  const auditActions: string[] = [];
  const admin = User.create({
    id: adminId,
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: 'hash',
    roles: ['ADMIN'],
    now,
  });

  const repositories = {
    users: { findById: async () => admin },
    items: {
      findById: async () => item,
      update: async (updated: Item) => {
        if (options.failUpdate === true) {
          throw new Error('database failure');
        }
        updates.push(updated);
      },
    },
    auditLogs: {
      create: async (entry: { action: string }) => {
        auditActions.push(entry.action);
      },
    },
  } as unknown as Repositories;

  return {
    unitOfWork: {
      async run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
        return work(repositories);
      },
      async read<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
        return work(repositories);
      },
    },
    updates,
    auditActions,
  };
}

describe('item image use cases', () => {
  test('upload replaces a managed image and audits the change', async () => {
    const { storage, removed } = fakeStorage();
    const item = makeItem('/images/items/7-file-0.png');
    const { unitOfWork, updates, auditActions } = fakeUnitOfWork(item);

    const updated = await new UploadItemImageUseCase(unitOfWork, storage, clock).execute({
      actorUserId: adminId,
      itemId,
      data: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    });

    expect(updated.imageUrl).toBe('/images/items/7-file-1.png');
    expect(updates).toHaveLength(1);
    expect(removed).toEqual(['7-file-0.png']);
    expect(auditActions).toEqual(['item.image.upload']);
  });

  test('upload removes the new file when the database write fails', async () => {
    const { storage, removed } = fakeStorage();
    const { unitOfWork } = fakeUnitOfWork(makeItem(), { failUpdate: true });
    const useCase = new UploadItemImageUseCase(unitOfWork, storage, clock);

    await expect(
      useCase.execute({
        actorUserId: adminId,
        itemId,
        data: new Uint8Array([1, 2, 3]),
        contentType: 'image/png',
      }),
    ).rejects.toThrow('database failure');
    expect(removed).toEqual(['7-file-1.png']);
  });

  test('remove clears an external link without touching storage', async () => {
    const { storage, removed } = fakeStorage();
    const item = makeItem('https://cdn.example.com/coffee.png');
    const { unitOfWork, auditActions } = fakeUnitOfWork(item);

    const updated = await new RemoveItemImageUseCase(unitOfWork, storage, clock).execute({
      actorUserId: adminId,
      itemId,
    });

    expect(updated.imageUrl).toBeNull();
    expect(removed).toEqual([]);
    expect(auditActions).toEqual(['item.image.remove']);
  });

  test('both use cases answer 503 when storage is disabled', async () => {
    const { unitOfWork } = fakeUnitOfWork(makeItem());

    await expect(
      new UploadItemImageUseCase(unitOfWork, null, clock).execute({
        actorUserId: adminId,
        itemId,
        data: new Uint8Array([1, 2, 3]),
        contentType: 'image/png',
      }),
    ).rejects.toThrow(ServiceUnavailableError);
    await expect(
      new RemoveItemImageUseCase(unitOfWork, null, clock).execute({
        actorUserId: adminId,
        itemId,
      }),
    ).rejects.toThrow(ServiceUnavailableError);
  });
});
