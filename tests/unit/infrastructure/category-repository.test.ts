import { describe, expect, test } from 'bun:test';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { CategoryRepository } from '@/infrastructure/repositories/category-repository';

describe('CategoryRepository', () => {
  test('fails clearly when the database returns no row after an insert', async () => {
    // Test double for the SQL boundary: a failed insert/select cycle must not yield a fake category.
    const database = {
      writeSql: () => ({ query: async () => [] }),
    } as unknown as DatabaseConnections;

    const repository = new CategoryRepository(database);

    await expect(repository.findOrCreateByName('Drinks')).rejects.toThrow(
      'Failed to create category',
    );
  });
});
