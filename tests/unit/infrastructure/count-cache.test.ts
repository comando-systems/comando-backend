import { describe, expect, test } from 'bun:test';
import { CountCache } from '@/infrastructure/database/count-cache';

function counter(values: number[] = []) {
  let calls = 0;
  return {
    load: async () => values[calls++] ?? calls,
    calls: () => calls,
  };
}

describe('CountCache', () => {
  test('reuses a total until it expires', async () => {
    let now = 0;
    const cache = new CountCache(1_000, () => now);
    const source = counter([10, 11]);

    expect(await cache.get('a', source.load)).toBe(10);
    now = 999;
    expect(await cache.get('a', source.load)).toBe(10);
    now = 1_000;
    expect(await cache.get('a', source.load)).toBe(11);
    expect(source.calls()).toBe(2);
  });

  test('keeps keys apart', async () => {
    const cache = new CountCache(1_000);
    const source = counter([1, 2]);

    expect(await cache.get('a', source.load)).toBe(1);
    expect(await cache.get('b', source.load)).toBe(2);
  });

  test('concurrent requests for one key share a single query', async () => {
    const cache = new CountCache(1_000);
    const source = counter([7]);

    const totals = await Promise.all(Array.from({ length: 5 }, () => cache.get('a', source.load)));

    expect(totals).toEqual([7, 7, 7, 7, 7]);
    expect(source.calls()).toBe(1);
  });

  test('a ttl of zero always counts', async () => {
    const cache = new CountCache(0);
    const source = counter([1, 2]);

    expect(await cache.get('a', source.load)).toBe(1);
    expect(await cache.get('a', source.load)).toBe(2);
  });

  test('a failed count is not served again', async () => {
    const cache = new CountCache(1_000);

    await expect(
      cache.get('a', async () => {
        throw new Error('database down');
      }),
    ).rejects.toThrow('database down');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await cache.get('a', async () => 3)).toBe(3);
  });

  test('forgets everything instead of growing past its limit', async () => {
    const cache = new CountCache(1_000, Date.now, 2);
    const source = counter([1, 2, 3, 4]);

    await cache.get('a', source.load);
    await cache.get('b', source.load);
    await cache.get('c', source.load);
    expect(await cache.get('a', source.load)).toBe(4);
  });
});
