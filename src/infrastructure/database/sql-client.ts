import { SQL } from 'bun';

type BunSqlClient = SQL;

export interface SqlClientOptions {
  readonly max?: number;
  readonly idleTimeout?: number;
  readonly connectionTimeout?: number;
}

/**
 * First-party SQL abstraction over Bun's native client. Repositories depend on
 * this class instead of a third-party database driver or its tagged template
 * types.
 */
export class SqlClient {
  private constructor(private readonly client: BunSqlClient) {}

  static connect(connectionString: string, options: SqlClientOptions = {}): SqlClient {
    return new SqlClient(
      new SQL(connectionString, {
        max: options.max,
        idleTimeout: options.idleTimeout,
        connectionTimeout: options.connectionTimeout,
      }),
    );
  }

  static wrap(client: BunSqlClient): SqlClient {
    return new SqlClient(client);
  }

  query<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    return this.client<T>(strings, ...values) as Promise<T>;
  }

  unsafe<T>(query: string, values?: unknown[] | Record<string, unknown>): Promise<T> {
    return this.client.unsafe<T>(query, values) as Promise<T>;
  }

  array(values: readonly unknown[], typeName?: Parameters<BunSqlClient['array']>[1]): unknown {
    return this.client.array([...values], typeName);
  }

  json(value: unknown): unknown {
    return this.client.json(value);
  }

  async transaction<T>(work: (transaction: SqlClient) => Promise<T>): Promise<T> {
    return this.client.begin(async (transaction) => work(SqlClient.wrap(transaction)));
  }

  async ping(): Promise<void> {
    await this.client`SELECT 1`;
  }

  async close(timeout = 5): Promise<void> {
    await this.client.close({ timeout });
  }
}
