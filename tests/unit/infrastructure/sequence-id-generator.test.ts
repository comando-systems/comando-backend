import { describe, expect, test } from 'bun:test';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import type { SqlClient } from '@/infrastructure/database/sql-client';

function fakeSql(rows: Array<{ id: string }>): SqlClient {
  return { query: async () => rows } as unknown as SqlClient;
}

describe('SequenceIdGenerator', () => {
  test('returns the next value of the sequence as text', async () => {
    expect(await new SequenceIdGenerator(fakeSql([{ id: '42' }]), 'orders_id_seq').next()).toBe(
      '42',
    );
  });

  test('fails loudly when the database returns nothing', async () => {
    await expect(new SequenceIdGenerator(fakeSql([]), 'orders_id_seq').next()).rejects.toThrow(
      'Failed to generate identifier',
    );
  });
});
