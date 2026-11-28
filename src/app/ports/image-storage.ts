export const SUPPORTED_IMAGE_CONTENT_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
] as const);

export type SupportedImageContentType = (typeof SUPPORTED_IMAGE_CONTENT_TYPES)[number];

export function isSupportedImageContentType(value: string): value is SupportedImageContentType {
  return (SUPPORTED_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

// Bun/Hono infer a file's MIME type from its filename, so the bytes must be checked as well.
export function hasImageSignature(
  data: Uint8Array,
  contentType: SupportedImageContentType,
): boolean {
  const startsWith = (bytes: readonly number[]) =>
    bytes.every((byte, index) => data[index] === byte);

  if (contentType === 'image/jpeg') {
    return startsWith([0xff, 0xd8, 0xff]);
  }

  if (contentType === 'image/png') {
    return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  return (
    String.fromCharCode(...data.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...data.subarray(8, 12)) === 'WEBP'
  );
}

export interface StoredImage {
  readonly data: Uint8Array;
  readonly contentType: string;
}

export interface SavedImage {
  readonly filename: string;
  readonly url: string;
}

/**
 * Storage for uploaded item images. Exists only when the deployment configures a directory;
 * external `imageUrl` links never use this port.
 */
export interface ImageStorage {
  save(itemId: string, image: StoredImage): Promise<SavedImage>;
  read(filename: string): Promise<StoredImage | null>;
  remove(filename: string): Promise<void>;
  publicUrl(filename: string): string;
  // Returns the managed filename when the URL points at this storage, otherwise null.
  filenameFromUrl(url: string): string | null;
}
