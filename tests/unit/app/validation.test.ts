import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { ValidationError } from '@/app/errors';
import type { AppEnv } from '@/app/http/types';
import { parseJson, parseQuery } from '@/app/http/validation';
import { requireOptionalDate, requirePage, requirePageSize } from '@/app/validation';

describe('pagination', () => {
  test('accepts positive integers', () => {
    expect(requirePage(1)).toBe(1);
    expect(requirePageSize(1)).toBe(1);
    expect(requirePageSize(100)).toBe(100);
  });

  test('rejects a page that is not a positive integer', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => requirePage(bad)).toThrow(ValidationError);
    }
  });

  test('rejects a page size outside 1 to 100', () => {
    for (const bad of [0, 101, 2.5, Number.NaN]) {
      expect(() => requirePageSize(bad)).toThrow(ValidationError);
    }
  });
});

describe('optional dates', () => {
  test('passes undefined through and copies valid dates', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const copy = requireOptionalDate(date, 'From');

    expect(requireOptionalDate(undefined, 'From')).toBeUndefined();
    expect(copy).toEqual(date);
    expect(copy).not.toBe(date);
  });

  test('names the field when the date is invalid', () => {
    expect(() => requireOptionalDate(new Date('nope'), 'To')).toThrow('To must be a valid date');
  });
});

describe('request parsing', () => {
  const schema = z.object({ name: z.string().min(1) });

  function app(): Hono<AppEnv> {
    const instance = new Hono<AppEnv>();
    instance.post('/body', async (context) => context.json(await parseJson(context, schema)));
    instance.get('/query', (context) => context.json(parseQuery(context, schema)));
    instance.onError((error, context) =>
      context.json(
        { name: error.name, message: error.message },
        error instanceof ValidationError ? 400 : 500,
      ),
    );
    return instance;
  }

  test('parses a valid body and query', async () => {
    const body = await app().request('/body', {
      method: 'POST',
      body: JSON.stringify({ name: 'Ada' }),
    });
    const query = await app().request('/query?name=Ada');

    expect(await body.json()).toEqual({ name: 'Ada' });
    expect(await query.json()).toEqual({ name: 'Ada' });
  });

  test('rejects a body that is not JSON', async () => {
    const response = await app().request('/body', { method: 'POST', body: '{nope' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: 'Request body must be valid JSON' });
  });

  test('rejects a body or query that does not match the schema', async () => {
    const body = await app().request('/body', { method: 'POST', body: JSON.stringify({}) });
    const query = await app().request('/query');

    expect(body.status).toBe(400);
    expect(query.status).toBe(400);
  });
});
