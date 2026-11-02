import { describe, expect, test } from 'bun:test';
import { ConfigurationError, loadConfig } from '@/app/config';

const validEnvironment = {
  DATABASE_URL: 'postgres://user:password@localhost:5432/comando',
  JWT_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  test('applies safe defaults', () => {
    const config = loadConfig(validEnvironment);

    expect(config.environment).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.jwtIssuer).toBe('comando');
    expect(config.jwtAudience).toBe('comando-api');
    expect(config.jwtExpiresInSeconds).toBe(900);
    expect(config.logLevel).toBe('info');
  });

  test('rejects missing secrets', () => {
    expect(() => loadConfig({ DATABASE_URL: validEnvironment.DATABASE_URL })).toThrow(
      ConfigurationError,
    );
  });

  test('rejects short JWT secrets', () => {
    expect(() => loadConfig({ ...validEnvironment, JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET must have at least 32 characters',
    );
  });

  test('rejects non-postgres database URLs', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, DATABASE_URL: 'mysql://localhost/comando' }),
    ).toThrow('DATABASE_URL must be a PostgreSQL connection string');
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
});
