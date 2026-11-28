import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasImageSignature } from '@/app/ports/image-storage';
import { LocalImageStorage } from '@/infrastructure/storage/local-image-storage';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let directory: string;
let storage: LocalImageStorage;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'comando-images-'));
  storage = new LocalImageStorage(directory, '/images');
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('LocalImageStorage', () => {
  test('saves, reads, and removes a managed image', async () => {
    const saved = await storage.save('7', { data: PNG, contentType: 'image/png' });

    expect(saved.filename).toMatch(/^7-[0-9a-f-]+\.png$/);
    expect(saved.url).toBe(`/images/items/${saved.filename}`);
    expect(storage.filenameFromUrl(saved.url)).toBe(saved.filename);
    expect(await storage.read(saved.filename)).toEqual({ data: PNG, contentType: 'image/png' });

    await storage.remove(saved.filename);
    expect(await storage.read(saved.filename)).toBeNull();
  });

  test('rejects content that does not match its declared type', async () => {
    await expect(
      storage.save('7', { data: new Uint8Array([1, 2, 3]), contentType: 'image/png' }),
    ).rejects.toThrow('Image content does not match its content type');
  });

  test('ignores external links and unsafe filenames', async () => {
    expect(storage.filenameFromUrl('https://cdn.example.com/coffee.jpg')).toBeNull();
    expect(storage.filenameFromUrl('/images/items/../../etc/passwd')).toBeNull();
    await expect(storage.read('../outside.png')).resolves.toBeNull();
    expect(() => storage.publicUrl('../outside.png')).toThrow('Invalid image filename');
  });

  test('rejects unsupported types and unexpected filesystem errors', async () => {
    const unsupported: string = 'image/gif';
    await expect(
      storage.save('7', {
        data: PNG,
        contentType: unsupported as Parameters<typeof storage.save>[1]['contentType'],
      }),
    ).rejects.toThrow('Unsupported image content type');
  });

  test('recognizes JPEG and WebP signatures', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const webp = new Uint8Array([
      ...new TextEncoder().encode('RIFF'),
      0,
      0,
      0,
      0,
      ...new TextEncoder().encode('WEBP'),
    ]);

    expect(hasImageSignature(jpeg, 'image/jpeg')).toBe(true);
    expect(hasImageSignature(webp, 'image/webp')).toBe(true);
    expect(hasImageSignature(PNG, 'image/jpeg')).toBe(false);
    expect(hasImageSignature(webp, 'image/png')).toBe(false);
  });
});
