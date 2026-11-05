import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { JsonLogger } from '@/infrastructure/logging/json-logger';

describe('JsonLogger', () => {
  let out: string[];
  let err: string[];
  let stdout: ReturnType<typeof spyOn>;
  let stderr: ReturnType<typeof spyOn>;

  beforeEach(() => {
    out = [];
    err = [];
    stdout = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    stderr = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
  });

  const last = (lines: string[]) => JSON.parse(lines[lines.length - 1] ?? '{}');

  test('writes one JSON line with level, message, and timestamp', () => {
    new JsonLogger('debug').info('started', { port: 3000 });

    const line = last(out);
    expect(line.level).toBe('info');
    expect(line.message).toBe('started');
    expect(line.port).toBe(3000);
    expect(new Date(line.timestamp).toString()).not.toBe('Invalid Date');
  });

  test('sends errors to stderr and everything else to stdout', () => {
    const logger = new JsonLogger('debug');

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(out.map((line) => JSON.parse(line).level)).toEqual(['debug', 'info', 'warn']);
    expect(err.map((line) => JSON.parse(line).level)).toEqual(['error']);
  });

  test('drops entries below the minimum level', () => {
    const logger = new JsonLogger('warn');

    logger.debug('d');
    logger.info('i');
    logger.warn('w');

    expect(out).toHaveLength(1);
    expect(last(out).message).toBe('w');
  });

  test('redacts sensitive keys at any depth, including in arrays', () => {
    new JsonLogger('info').info('login', {
      email: 'ada@example.com',
      password: 'p4ss',
      headers: { Authorization: 'Bearer abc', cookie: 'session=1', 'x-ok': 'yes' },
      attempts: [{ sessionToken: 'tok', ok: true }],
      jwtSecret: 's',
      credential: 'c',
    });

    const line = last(out);
    expect(line.email).toBe('ada@example.com');
    expect(line.password).toBe('[redacted]');
    expect(line.headers.Authorization).toBe('[redacted]');
    expect(line.headers.cookie).toBe('[redacted]');
    expect(line.headers['x-ok']).toBe('yes');
    expect(line.attempts[0].sessionToken).toBe('[redacted]');
    expect(line.attempts[0].ok).toBe(true);
    expect(line.jwtSecret).toBe('[redacted]');
    expect(line.credential).toBe('[redacted]');
    expect(out.join('')).not.toContain('p4ss');
    expect(out.join('')).not.toContain('Bearer abc');
  });

  test('serializes errors and redacts sensitive keys inside them', () => {
    const failure = new Error('failed');
    Object.assign(failure, { password: 'p4ss' });

    new JsonLogger('error').error('request failed', failure, { requestId: 'r1' });

    const line = last(err);
    expect(line.error.name).toBe('Error');
    expect(line.error.message).toBe('failed');
    expect(line.requestId).toBe('r1');
  });

  test('handles circular references, dates, and nullish values', () => {
    const loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;

    new JsonLogger('info').info('shapes', {
      loop,
      at: new Date('2026-01-01T00:00:00.000Z'),
      nothing: null,
      missing: undefined,
    });

    const line = last(out);
    expect(line.loop.self).toBe('[circular]');
    expect(line.at).toBe('2026-01-01T00:00:00.000Z');
    expect(line.nothing).toBeNull();
    expect(line).not.toHaveProperty('missing');
  });

  test('child loggers add context without mutating the parent', () => {
    const parent = new JsonLogger('info', { service: 'api' });
    const child = parent.child({ requestId: 'r1' });

    child.info('child');
    parent.info('parent');

    expect(JSON.parse(out[0] ?? '{}')).toMatchObject({ service: 'api', requestId: 'r1' });
    expect(JSON.parse(out[1] ?? '{}')).not.toHaveProperty('requestId');
  });
});
