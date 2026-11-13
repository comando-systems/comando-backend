import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqlClient } from '@/infrastructure/database/sql-client';
import { TEST_DATABASE_URL } from './support/database';

const MIGRATIONS_DIR = join(import.meta.dir, '..', '..', 'migrations');

interface Migration {
  readonly version: string;
  readonly name: string;
  readonly up: string;
  readonly down: string;
}

function loadMigrations(): Migration[] {
  const versions = readdirSync(MIGRATIONS_DIR)
    .map((file) => /^(\d+)_(.+)\.up\.sql$/.exec(file))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ version: match[1] as string, name: match[2] as string }))
    .sort((a, b) => a.version.localeCompare(b.version));

  return versions.map(({ version, name }) => ({
    version,
    name,
    up: readFileSync(join(MIGRATIONS_DIR, `${version}_${name}.up.sql`), 'utf8'),
    down: readFileSync(join(MIGRATIONS_DIR, `${version}_${name}.down.sql`), 'utf8'),
  }));
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

describe.skipIf(!TEST_DATABASE_URL)('migrations', () => {
  const migrations = loadMigrations();
  const databaseName = `comando_migrations_${crypto.randomUUID().replaceAll('-', '')}`;
  let admin: SqlClient;
  let sql: SqlClient;

  async function applyAll(direction: 'up' | 'down'): Promise<void> {
    const ordered = direction === 'up' ? migrations : [...migrations].reverse();
    for (const migration of ordered) {
      await sql.unsafe(direction === 'up' ? migration.up : migration.down);
    }
  }

  const rows = <T>(query: string, values?: unknown[]) => sql.unsafe<T[]>(query, values);

  // Structure only, ordered, so two schemas can be compared for equality.
  async function fingerprint(): Promise<string[]> {
    const columns = await rows<{ line: string }>(`
      SELECT table_name::text || '.' || column_name::text || ' ' || data_type::text
        || ' ' || is_nullable::text || ' ' || coalesce(column_default::text, '') AS line
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `);
    const constraints = await rows<{ line: string }>(`
      SELECT conrelid::regclass::text || ' ' || conname::text || ' '
        || pg_get_constraintdef(oid) AS line
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      ORDER BY 1
    `);
    const indexes = await rows<{ line: string }>(`
      SELECT indexdef::text AS line FROM pg_indexes
      WHERE schemaname = 'public' ORDER BY indexname
    `);
    const enums = await rows<{ line: string }>(`
      SELECT e.enumtypid::regtype::text || ' ' || e.enumlabel::text AS line
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typnamespace = 'public'::regnamespace
      ORDER BY e.enumtypid::regtype::text, e.enumsortorder
    `);

    return [...columns, ...constraints, ...indexes, ...enums].map((row) => row.line);
  }

  async function publicObjects(): Promise<{ tables: number; enums: number }> {
    const [tables] = await rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const [enums] = await rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_type
       WHERE typnamespace = 'public'::regnamespace AND typtype = 'e'`,
    );
    return { tables: Number(tables?.count), enums: Number(enums?.count) };
  }

  // Creating a database can take a few seconds while other test files hold connections.
  beforeAll(async () => {
    admin = SqlClient.connect(withDatabase(TEST_DATABASE_URL as string, 'postgres'), { max: 1 });
    await admin.unsafe(`CREATE DATABASE ${databaseName}`);
    sql = SqlClient.connect(withDatabase(TEST_DATABASE_URL as string, databaseName), { max: 1 });
  }, 60_000);

  afterAll(async () => {
    await sql.close();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await admin.close();
  }, 60_000);

  test('every version has an UP and a DOWN file in sequence', () => {
    expect(migrations.length).toBeGreaterThan(0);
    migrations.forEach((migration, index) => {
      expect(Number(migration.version)).toBe(index + 1);
      expect(migration.up.trim().length).toBeGreaterThan(0);
      expect(migration.down.trim().length).toBeGreaterThan(0);
    });
  });

  test('applies every UP on an empty database', async () => {
    await applyAll('up');

    const tables = await rows<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = tables.map((table) => table.table_name);
    for (const expected of [
      'users',
      'roles',
      'user_roles',
      'refresh_tokens',
      'items',
      'orders',
      'order_items',
      'order_payments',
      'audit_logs',
      'settings',
    ]) {
      expect(names).toContain(expected);
    }
  });

  test('seeds the singleton settings row', async () => {
    const settings = await rows<{ service_fee_basis_points: number }>(
      'SELECT service_fee_basis_points FROM settings',
    );

    expect(settings).toHaveLength(1);
    expect(settings[0]?.service_fee_basis_points).toBe(1000);
  });

  test('replaces the generic adjustment with explicit surcharge and discount amounts', async () => {
    const columns = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders'`,
    );
    const names = columns.map((column) => column.column_name);
    expect(names).toContain('surcharge_cents');
    expect(names).toContain('discount_cents');
    expect(names).not.toContain('adjustment_cents');
    expect(names).not.toContain('adjustment_type');

    const enums = await rows<{ typname: string }>(
      `SELECT typname FROM pg_type
       WHERE typnamespace = 'public'::regnamespace AND typtype = 'e'`,
    );
    expect(enums.map((type) => type.typname)).not.toContain('order_adjustment_type');
    expect(enums.map((type) => type.typname)).not.toContain('order_adjustment_mode');
  });

  test('enforces the order workflow constraints', async () => {
    const [user] = await rows<{ id: string }>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Tester', 'tester@example.com', 'hash') RETURNING id::text AS id`,
    );
    const userId = user?.id as string;

    await sql.unsafe(
      `INSERT INTO orders (order_type, status, table_code, opened_by_user_id,
                           payment_requested_at, payment_requested_by_user_id)
       VALUES ('TABLE', 'AWAITING_PAYMENT', 'T-1', $1, now(), $1)`,
      [userId],
    );

    // A table waiting for payment is still occupied.
    await expect(
      sql.unsafe(
        `INSERT INTO orders (order_type, status, table_code, opened_by_user_id)
         VALUES ('TABLE', 'OPEN', 'T-1', $1)`,
        [userId],
      ),
    ).rejects.toThrow();

    // AWAITING_PAYMENT requires who and when.
    await expect(
      sql.unsafe(
        `INSERT INTO orders (order_type, status, table_code, opened_by_user_id)
         VALUES ('TABLE', 'AWAITING_PAYMENT', 'T-2', $1)`,
        [userId],
      ),
    ).rejects.toThrow();

    // Only table orders can wait for payment.
    await expect(
      sql.unsafe(
        `INSERT INTO orders (order_type, status, opened_by_user_id, closed_at, closed_by_user_id,
                             payment_requested_at, payment_requested_by_user_id)
         VALUES ('COUNTER', 'AWAITING_PAYMENT', $1, now(), $1, now(), $1)`,
        [userId],
      ),
    ).rejects.toThrow();

    // Both monetary amounts are non-negative.
    await expect(
      sql.unsafe(
        `INSERT INTO orders (order_type, status, table_code, opened_by_user_id, surcharge_cents)
         VALUES ('TABLE', 'OPEN', 'T-3', $1, -1)`,
        [userId],
      ),
    ).rejects.toThrow();
    await expect(
      sql.unsafe(
        `INSERT INTO orders (order_type, status, table_code, opened_by_user_id, discount_cents)
         VALUES ('TABLE', 'OPEN', 'T-4', $1, -1)`,
        [userId],
      ),
    ).rejects.toThrow();

    // Service fee fields stay zero when the fee is not applied.
    await expect(
      sql.unsafe(
        `INSERT INTO orders (order_type, status, table_code, opened_by_user_id,
                             apply_service_fee, service_fee_basis_points, service_fee_cents)
         VALUES ('TABLE', 'OPEN', 'T-5', $1, false, 1000, 50)`,
        [userId],
      ),
    ).rejects.toThrow();

    // Cash tender must cover the amount and match the change.
    const [order] = await rows<{ id: string }>('SELECT id::text AS id FROM orders LIMIT 1');
    await expect(
      sql.unsafe(
        `INSERT INTO order_payments (order_id, method, amount_cents, received_cents, change_cents)
         VALUES ($1, 'CASH', 1000, 1500, 100)`,
        [order?.id],
      ),
    ).rejects.toThrow();
    await expect(
      sql.unsafe(
        `INSERT INTO order_payments (order_id, method, amount_cents, received_cents, change_cents)
         VALUES ($1, 'PIX', 1000, 1500, 500)`,
        [order?.id],
      ),
    ).rejects.toThrow();
  });

  test('rejects a second settings row and a blank item category', async () => {
    await expect(sql.unsafe('INSERT INTO settings (id) VALUES (2)')).rejects.toThrow();
    await expect(
      sql.unsafe(`INSERT INTO items (name, price_cents, category) VALUES ('X', 100, '   ')`),
    ).rejects.toThrow();
  });

  test('creates only indexes backed by application queries', async () => {
    const kept = [
      'items_sellable_category_idx',
      'orders_history_idx',
      'orders_status_created_idx',
      'orders_closed_at_idx',
      'orders_canceled_at_idx',
      'orders_one_active_per_table_idx',
      'order_payments_order_id_idx',
      'refresh_tokens_user_active_idx',
      'audit_logs_created_at_idx',
    ];
    const removed = [
      'user_roles_role_id_idx',
      'orders_status_type_idx',
      'items_active_name_idx',
      'order_items_item_id_idx',
      'audit_logs_actor_created_at_idx',
      'audit_logs_target_idx',
    ];
    const present = (names: readonly string[]) =>
      rows<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND indexname IN (${names.map((name) => `'${name}'`).join(', ')})`,
      );

    expect((await present(kept)).length).toBe(kept.length);
    expect(await present(removed)).toEqual([]);
  });

  test('UP, DOWN, UP leaves exactly the same schema', async () => {
    await sql.unsafe('TRUNCATE orders, users RESTART IDENTITY CASCADE');
    const first = await fingerprint();

    await applyAll('down');
    expect(await publicObjects()).toEqual({ tables: 0, enums: 0 });

    await applyAll('up');
    expect(await fingerprint()).toEqual(first);
  });
});
