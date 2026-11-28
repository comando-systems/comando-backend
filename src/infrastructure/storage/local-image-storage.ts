import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { AppConfig } from '@/app/config';
import {
  hasImageSignature,
  type ImageStorage,
  isSupportedImageContentType,
  type SavedImage,
  type StoredImage,
  type SupportedImageContentType,
} from '@/app/ports/image-storage';

const FILENAME_PATTERN =
  /^[1-9]\d*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const EXTENSIONS: Readonly<Record<SupportedImageContentType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const CONTENT_TYPES: Readonly<Record<string, SupportedImageContentType>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Stores managed files under `<dir>/items/` and serves them from `${publicBaseUrl}/items/`. */
export class LocalImageStorage implements ImageStorage {
  constructor(
    private readonly directory: string,
    private readonly publicBaseUrl: string,
  ) {}

  async save(itemId: string, image: StoredImage): Promise<SavedImage> {
    if (!isSupportedImageContentType(image.contentType)) {
      throw new Error('Unsupported image content type');
    }

    if (!hasImageSignature(image.data, image.contentType)) {
      throw new Error('Image content does not match its content type');
    }

    const filename = `${itemId}-${crypto.randomUUID()}.${EXTENSIONS[image.contentType]}`;
    const path = this.pathFor(filename);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, image.data);
    return { filename, url: this.publicUrl(filename) };
  }

  async read(filename: string): Promise<StoredImage | null> {
    const extension = filename.split('.').at(-1) ?? '';
    const contentType = CONTENT_TYPES[extension];

    if (!FILENAME_PATTERN.test(filename) || contentType === undefined) {
      return null;
    }

    try {
      const data = await readFile(this.pathFor(filename));
      return { data: new Uint8Array(data), contentType };
    } catch {
      // A missing or unreadable file is simply not servable.
      return null;
    }
  }

  async remove(filename: string): Promise<void> {
    try {
      await unlink(this.pathFor(filename));
    } catch {
      // Cleanup is best-effort: an already missing file needs no removal.
    }
  }

  publicUrl(filename: string): string {
    return `${this.publicBaseUrl}/items/${this.validateFilename(filename)}`;
  }

  filenameFromUrl(url: string): string | null {
    const prefix = `${this.publicBaseUrl}/items/`;

    if (!url.startsWith(prefix)) {
      return null;
    }

    const filename = url.slice(prefix.length);
    return FILENAME_PATTERN.test(filename) ? filename : null;
  }

  private pathFor(filename: string): string {
    // The filename pattern has no separators or `..`, so it cannot escape this directory.
    return resolve(this.directory, 'items', this.validateFilename(filename));
  }

  private validateFilename(filename: string): string {
    if (!FILENAME_PATTERN.test(filename)) {
      throw new Error('Invalid image filename');
    }
    return filename;
  }
}

export function createImageStorage(config: AppConfig): ImageStorage | null {
  if (config.imageStorageDir === undefined) {
    return null;
  }

  return new LocalImageStorage(resolve(config.imageStorageDir), config.imagePublicBaseUrl);
}
