import { describe, expect, test } from 'bun:test';
import { createApp } from '@/app/http/app';
import { createTestContainer } from '../support/container';

describe('health endpoints', () => {
  test('returns liveness without exposing configuration', async () => {
    const app = createApp(createTestContainer());
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  test('returns readiness when the database responds', async () => {
    const app = createApp(createTestContainer());
    const response = await app.request('/health/ready');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('returns a sanitized 404 for unknown routes', async () => {
    const app = createApp(createTestContainer());
    const response = await app.request('/missing');
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
