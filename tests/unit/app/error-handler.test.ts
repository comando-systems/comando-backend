import { describe, expect, test } from 'bun:test';
import { ForbiddenError } from '@/app/errors';
import { toErrorResponse } from '@/app/http/error-handler';
import type { LogContext, Logger } from '@/app/ports/logger';
import { InvalidStateTransitionError } from '@/domain/errors';

class CapturingLogger implements Logger {
  readonly errors: Array<{ message: string; error: unknown; context?: LogContext }> = [];

  debug(): void {}
  info(): void {}
  warn(): void {}

  error(message: string, error?: unknown, context?: LogContext): void {
    this.errors.push({ message, error, context });
  }

  child(): Logger {
    return this;
  }
}

describe('toErrorResponse', () => {
  test('returns application errors without leaking internals', () => {
    const response = toErrorResponse(new ForbiddenError(), 'request-1', new CapturingLogger());

    expect(response.status).toBe(403);
    expect(response.body.error).toEqual({
      code: 'FORBIDDEN',
      message: 'You are not allowed to perform this action',
      requestId: 'request-1',
    });
  });

  test('maps invalid state transitions to a conflict', () => {
    const response = toErrorResponse(
      new InvalidStateTransitionError('Order is not open'),
      undefined,
      new CapturingLogger(),
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  test('sanitizes unexpected errors and logs them once', () => {
    const logger = new CapturingLogger();
    const error = new Error('connection string postgres://user:secret@host/db');

    const response = toErrorResponse(error, 'request-2', logger);

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'request-2',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]?.error).toBe(error);
  });
});
