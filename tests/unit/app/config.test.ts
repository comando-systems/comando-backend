import { describe, expect, test } from 'bun:test';
import { ConfigurationError, loadConfig } from '@/app/config';

const validEnvironment = {
  DATABASE_READ_URL: 'postgres://reader:password@localhost:5432/comando',
  DATABASE_WRITE_URL: 'postgres://writer:password@localhost:5432/comando',
  JWT_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  test('applies safe defaults', () => {
    const config = loadConfig(validEnvironment);

    expect(config.environment).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.databaseReadUrl).toBe(validEnvironment.DATABASE_READ_URL);
    expect(config.databaseWriteUrl).toBe(validEnvironment.DATABASE_WRITE_URL);
    expect(config.jwtIssuer).toBe('comando');
    expect(config.jwtAudience).toBe('comando-api');
    expect(config.jwtExpiresInSeconds).toBe(900);
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
        JWT_SECRET: validEnvironment.JWT_SECRET,
      }),
    ).toThrow('DATABASE_WRITE_URL');
  });

  test('rejects short JWT secrets', () => {
    expect(() => loadConfig({ ...validEnvironment, JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET must have at least 32 characters',
    );
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
      JWT_EXPIRES_IN_SECONDS: '120',
      LOG_LEVEL: 'debug',
    });

    expect(config.port).toBe(8080);
    expect(config.jwtExpiresInSeconds).toBe(120);
    expect(config.logLevel).toBe('debug');
  });

  describe('API documentation switch', () => {
    test('is on outside production and off in production by default', () => {
      expect(loadConfig({ ...validEnvironment, NODE_ENV: 'development' }).docsEnabled).toBe(true);
      expect(loadConfig({ ...validEnvironment, NODE_ENV: 'test' }).docsEnabled).toBe(true);
      expect(loadConfig({ ...validEnvironment, NODE_ENV: 'production' }).docsEnabled).toBe(false);
    });

    test('can be forced either way', () => {
      expect(
        loadConfig({ ...validEnvironment, NODE_ENV: 'production', API_DOCS_ENABLED: 'true' })
          .docsEnabled,
      ).toBe(true);
      expect(
        loadConfig({ ...validEnvironment, NODE_ENV: 'development', API_DOCS_ENABLED: 'false' })
          .docsEnabled,
      ).toBe(false);
    });

    test('treats an empty value as unset and rejects anything else', () => {
      expect(
        loadConfig({ ...validEnvironment, NODE_ENV: 'production', API_DOCS_ENABLED: '' })
          .docsEnabled,
      ).toBe(false);
      expect(() => loadConfig({ ...validEnvironment, API_DOCS_ENABLED: 'yes' })).toThrow(
        ConfigurationError,
      );
    });
  });
});
