import type { Context } from 'hono';
import type { z } from 'zod';
import { ValidationError } from '@/app/errors';
import { toValidationError } from '@/app/http/error-handler';
import type { AppEnv } from '@/app/http/types';
import {
  hasImageSignature,
  isSupportedImageContentType,
  type SupportedImageContentType,
} from '@/app/ports/image-storage';

export async function parseJson<T>(context: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;

  try {
    body = await context.req.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}

export interface UploadedImage {
  readonly data: Uint8Array;
  readonly contentType: SupportedImageContentType;
}

export async function parseImageUpload(
  context: Context<AppEnv>,
  maxBytes: number,
): Promise<UploadedImage> {
  let form: FormData;

  try {
    form = await context.req.formData();
  } catch {
    throw new ValidationError('Request body must be multipart/form-data');
  }

  const file = form.get('file');

  if (!(file instanceof File)) {
    throw new ValidationError('A file field named `file` is required');
  }

  if (!isSupportedImageContentType(file.type)) {
    throw new ValidationError('Only JPEG, PNG, and WebP images are accepted');
  }

  if (file.size === 0 || file.size > maxBytes) {
    throw new ValidationError(`Image must be between 1 byte and ${maxBytes} bytes`);
  }

  const data = new Uint8Array(await file.arrayBuffer());

  if (!hasImageSignature(data, file.type)) {
    throw new ValidationError('Image content does not match its content type');
  }

  return { data, contentType: file.type };
}

export function parseQuery<T>(context: Context<AppEnv>, schema: z.ZodType<T>): T {
  const result = schema.safeParse(context.req.query());

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}
