import type { Context } from 'hono';
import type { z } from 'zod';
import { ValidationError } from '@/app/errors';
import { toValidationError } from '@/app/http/error-handler';
import type { AppEnv } from '@/app/http/types';

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

export function parseQuery<T>(context: Context<AppEnv>, schema: z.ZodType<T>): T {
  const result = schema.safeParse(context.req.query());

  if (!result.success) {
    throw toValidationError(result.error);
  }

  return result.data;
}
