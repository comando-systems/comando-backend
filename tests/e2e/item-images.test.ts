import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppContainer } from '@/app/container';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';
import { createHarness } from './support/harness';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MAX_BYTES = 1024;

interface ItemDto {
  id: string;
  imageUrl: string | null;
}

function imageForm(data: Uint8Array, filename = 'image.png'): FormData {
  const form = new FormData();
  form.set('file', new File([data], filename));
  return form;
}

async function login(harness: ReturnType<typeof createHarness>, name: string): Promise<string> {
  await harness.createUser(name, ['ADMIN', 'CASHIER', 'SERVER']);
  return harness.login(name);
}

async function createItem(
  harness: ReturnType<typeof createHarness>,
  token: string,
  name: string,
  imageUrl?: string,
): Promise<ItemDto> {
  const response = await harness.request('/items', {
    method: 'POST',
    token,
    body: { name, priceCents: 750, imageUrl: imageUrl ?? null },
  });
  expect(response.status).toBe(201);
  return (await response.json()) as ItemDto;
}

describe.skipIf(!TEST_DATABASE_URL)('item image uploads', () => {
  const harness = createHarness();
  let container: AppContainer;
  let directory: string;
  let token: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'comando-e2e-images-'));
    container = harness.start({
      IMAGE_STORAGE_DIR: directory,
      IMAGE_MAX_BYTES: String(MAX_BYTES),
    });
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
    token = await login(harness, 'admin');
  });

  afterAll(async () => {
    await container.close();
    await rm(directory, { recursive: true, force: true });
  });

  test('uploads an image and serves it publicly', async () => {
    const item = await createItem(harness, token, 'Espresso', 'https://example.com/old.png');

    const response = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token,
      formData: imageForm(PNG),
    });

    expect(response.status).toBe(200);
    const updated = (await response.json()) as ItemDto;
    expect(updated.imageUrl).toMatch(/^\/images\/items\/\d+-[0-9a-f-]+\.png$/);

    const served = await harness.request(updated.imageUrl as string);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
  });

  test('replaces and removes a stored image', async () => {
    const item = await createItem(harness, token, 'Espresso');

    const first = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token,
      formData: imageForm(PNG),
    });
    const firstUrl = ((await first.json()) as ItemDto).imageUrl as string;

    const second = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token,
      formData: imageForm(PNG),
    });
    const secondUrl = ((await second.json()) as ItemDto).imageUrl as string;

    expect(secondUrl).not.toBe(firstUrl);
    expect((await harness.request(firstUrl)).status).toBe(404);
    expect((await harness.request(secondUrl)).status).toBe(200);

    const removed = await harness.request(`/items/${item.id}/image`, {
      method: 'DELETE',
      token,
    });

    expect(removed.status).toBe(200);
    expect(((await removed.json()) as ItemDto).imageUrl).toBeNull();
    expect((await harness.request(secondUrl)).status).toBe(404);
  });

  test('rejects invalid types, oversized files, unsafe paths, and non-admins', async () => {
    const item = await createItem(harness, token, 'Espresso');

    const invalidType = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token,
      formData: imageForm(PNG, 'notes.txt'),
    });
    expect(invalidType.status).toBe(400);

    const fakeImage = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token,
      formData: imageForm(new Uint8Array([1, 2, 3])),
    });
    expect(fakeImage.status).toBe(400);

    const oversized = new Uint8Array(MAX_BYTES + 1);
    oversized.set(PNG);
    const tooLarge = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token,
      formData: imageForm(oversized),
    });
    expect(tooLarge.status).toBe(400);

    expect((await harness.request('/images/items/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);

    await harness.createUser('server', ['SERVER']);
    const serverToken = await harness.login('server');
    const forbidden = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token: serverToken,
      formData: imageForm(PNG),
    });
    expect(forbidden.status).toBe(403);
  });

  test('rejects a missing file, a non-multipart body, and unavailable items', async () => {
    const item = await createItem(harness, token, 'Espresso');

    const missingFile = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token,
      formData: new FormData(),
    });
    expect(missingFile.status).toBe(400);

    const notMultipart = await harness.request(`/items/${item.id}/image`, {
      method: 'POST',
      token,
      body: 'not a form',
    });
    expect(notMultipart.status).toBe(400);

    const unknown = await harness.request('/items/999999/image', {
      method: 'POST',
      token,
      formData: imageForm(PNG),
    });
    expect(unknown.status).toBe(404);

    const removed = await harness.request(`/items/${item.id}`, { method: 'DELETE', token });
    expect(removed.status).toBe(200);
    expect(
      (
        await harness.request(`/items/${item.id}/image`, {
          method: 'POST',
          token,
          formData: imageForm(PNG),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await harness.request(`/items/${item.id}/image`, {
          method: 'DELETE',
          token,
        })
      ).status,
    ).toBe(409);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('item images with storage disabled', () => {
  const harness = createHarness();
  let container: AppContainer;
  let token: string;

  beforeAll(() => {
    container = harness.start();
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
    token = await login(harness, 'admin');
  });

  afterAll(async () => {
    await container.close();
  });

  test('upload routes answer 503 but external links keep working', async () => {
    const item = await createItem(harness, token, 'Espresso', 'https://example.com/coffee.png');

    expect(item.imageUrl).toBe('https://example.com/coffee.png');
    expect(
      (
        await harness.request(`/items/${item.id}/image`, {
          method: 'POST',
          token,
          formData: imageForm(PNG),
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await harness.request(`/items/${item.id}/image`, {
          method: 'DELETE',
          token,
        })
      ).status,
    ).toBe(503);
    expect((await harness.request('/images/items/1-file.png')).status).toBe(404);
  });
});
