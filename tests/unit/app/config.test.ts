import { describe, expect, test } from 'bun:test';
import { ConfigurationError, loadConfig } from '@/app/config';

const validEnvironment = {
  DATABASE_READ_URL: 'postgres://reader:password@localhost:5432/comando',
  DATABASE_WRITE_URL: 'postgres://writer:password@localhost:5432/comando',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
};

describe('loadConfig', () => {
  test('applies safe defaults', () => {
    const config = loadConfig(validEnvironment);

    expect(config.environment).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.databaseReadUrl).toBe(validEnvironment.DATABASE_READ_URL);
    expect(config.databaseWriteUrl).toBe(validEnvironment.DATABASE_WRITE_URL);
    expect(config.appScheme).toBe('comando');
    expect(config.logLevel).toBe('info');
  });

  test('rejects missing secrets', () => {
    expect(() =>
      loadConfig({
        DATABASE_READ_URL: validEnvironment.DATABASE_READ_URL,
        DATABASE_WRITE_URL: validEnvironment.DATABASE_WRITE_URL,
      }),
    ).toThrow(ConfigurationError);
  });

  test('requires both read and write database URLs', () => {
    expect(() =>
      loadConfig({
        DATABASE_READ_URL: validEnvironment.DATABASE_READ_URL,
        BETTER_AUTH_SECRET: validEnvironment.BETTER_AUTH_SECRET,
      }),
    ).toThrow('DATABASE_WRITE_URL');
  });

  test('rejects non-postgres database URLs', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, DATABASE_WRITE_URL: 'mysql://localhost/comando' }),
    ).toThrow('must be a PostgreSQL connection string');
  });

  test('rejects out-of-range ports', () => {
    expect(() => loadConfig({ ...validEnvironment, PORT: '70000' })).toThrow(ConfigurationError);
  });

  test('parses numeric values', () => {
    const config = loadConfig({
      ...validEnvironment,
      PORT: '8080',
      LOG_LEVEL: 'debug',
    });

    expect(config.port).toBe(8080);
    expect(config.appScheme).toBe('comando');
    expect(config.logLevel).toBe('debug');
  });
});
