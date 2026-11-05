import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { requestIdMiddleware } from '@/app/http/middleware/request-id';
import { requestLoggerMiddleware } from '@/app/http/middleware/request-logger';
import type { AppEnv } from '@/app/http/types';
import type { LogContext, Logger } from '@/app/ports/logger';

interface LogEntry {
  message: string;
  context?: LogContext;
}

class CapturingLogger implements Logger {
  constructor(
    readonly entries: LogEntry[] = [],
    private readonly baseContext: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    this.entries.push({ message, context: { ...this.baseContext, ...context } });
  }
  info(message: string, context?: LogContext): void {
    this.entries.push({ message, context: { ...this.baseContext, ...context } });
  }
  warn(message: string, context?: LogContext): void {
    this.entries.push({ message, context: { ...this.baseContext, ...context } });
  }
  error(message: string, _error?: unknown, context?: LogContext): void {
    this.entries.push({ message, context: { ...this.baseContext, ...context } });
  }
  child(context: LogContext): Logger {
    return new CapturingLogger(this.entries, { ...this.baseContext, ...context });
  }
}

describe('requestLoggerMiddleware', () => {
  test('logs request id, method, matched route, path, status, and duration', async () => {
    const logger = new CapturingLogger();
    const app = new Hono<AppEnv>();

    app.use('*', requestIdMiddleware());
    app.use('*', requestLoggerMiddleware(logger));
    app.get('/items/:id', (context) => context.json({ ok: true }));

    const response = await app.request('/items/42', {
      headers: { 'x-request-id': 'request-42' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('request-42');

    const entry = logger.entries[0];
    expect(entry?.message).toBe('request completed');
    expect(entry?.context).toMatchObject({
      requestId: 'request-42',
      method: 'GET',
      route: '/items/:id',
      path: '/items/42',
      status: 200,
    });
    expect(typeof entry?.context?.durationMs).toBe('number');
  });
});
