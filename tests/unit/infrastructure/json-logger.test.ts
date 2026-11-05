import { describe, expect, spyOn, test } from 'bun:test';
import { JsonLogger } from '@/infrastructure/logging/json-logger';

function capturedLine(write: ReturnType<typeof spyOn>): Record<string, unknown> {
  const line = write.mock.calls[0]?.[0];

  if (typeof line !== 'string') {
    throw new Error('Expected the logger to write a JSON line');
  }

  return JSON.parse(line) as Record<string, unknown>;
}

describe('JsonLogger', () => {
  test('redacts sensitive keys, tokens, hashes, and authorization values', () => {
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      const logger = new JsonLogger('info');
      logger.info('request completed', {
        password: 'plain-password',
        secret: 'plain-secret',
        token: 'plain-token',
        authorization: 'Bearer abc.def.ghi',
        nested: {
          passwordHash: 'hash',
          cookie: 'session=value',
        },
        jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
        hash: '$argon2id$v=19$m=65536,t=2,p=1$c2FsdA$aGFzaA',
        message: 'failed for Bearer abc.def.ghi',
        safe: 'visible',
      });

      const payload = capturedLine(write);
      const nested = payload.nested as Record<string, unknown>;

      expect(payload.password).toBe('[redacted]');
      expect(payload.secret).toBe('[redacted]');
      expect(payload.token).toBe('[redacted]');
      expect(payload.authorization).toBe('[redacted]');
      expect(nested.passwordHash).toBe('[redacted]');
      expect(nested.cookie).toBe('[redacted]');
      expect(payload.jwt).toBe('[redacted]');
      expect(payload.hash).toBe('[redacted-hash]');
      expect(payload.message).toBe('failed for Bearer [redacted]');
      expect(payload.safe).toBe('visible');
    } finally {
      write.mockRestore();
    }
  });

  test('redacts sensitive values inside errors', () => {
    const write = spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      const logger = new JsonLogger('error');
      logger.error('unexpected failure', new Error('rejected Bearer abc.def.ghi'));

      const payload = capturedLine(write);
      const error = payload.error as Record<string, unknown>;

      expect(error.message).toBe('rejected Bearer [redacted]');
    } finally {
      write.mockRestore();
    }
  });
});
