import { describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '@/app/errors';
import { toErrorResponse, toValidationError, zodDetails } from '@/app/http/error-handler';
import type { Logger } from '@/app/ports/logger';
import {
  DomainError,
  InvalidStateTransitionError,
  InvalidValueError,
  InvariantViolationError,
} from '@/domain/errors';

function createLogger() {
  const error = mock(() => {});
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error,
    child: () => logger,
  };
  return { logger, error };
}

describe('application errors', () => {
  test.each([
    [new ValidationError(), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ConflictError(), 409, 'CONFLICT'],
    [new PayloadTooLargeError(), 413, 'PAYLOAD_TOO_LARGE'],
    [new TooManyRequestsError(), 429, 'TOO_MANY_REQUESTS'],
    [new ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE'],
  ])('%p carries its HTTP status and code', (error, status, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });

  test('keeps a custom message and details', () => {
    const error = new ValidationError('Bad input', [{ path: 'name' }]);

    expect(error.message).toBe('Bad input');
    expect(error.details).toEqual([{ path: 'name' }]);
    expect(error.name).toBe('ValidationError');
  });

  test('every error has a sensible default message', () => {
    expect(new ServiceUnavailableError().message).toBe('Service unavailable');
    expect(new TooManyRequestsError().message.length).toBeGreaterThan(0);
  });
});

describe('error responses', () => {
  test('maps an application error without logging it', () => {
    const { logger, error } = createLogger();

    const { status, body } = toErrorResponse(new ConflictError('Table is taken'), 'req-1', logger);

    expect(status).toBe(409);
    expect(body).toEqual({
      error: { code: 'CONFLICT', message: 'Table is taken', requestId: 'req-1' },
    });
    expect(error).not.toHaveBeenCalled();
  });

  test('includes details only when present', () => {
    const { logger } = createLogger();

    const withDetails = toErrorResponse(new ValidationError('Bad', ['x']), undefined, logger);
    const without = toErrorResponse(new NotFoundError(), undefined, logger);

    expect(withDetails.body.error.details).toEqual(['x']);
    expect(withDetails.body.error).not.toHaveProperty('requestId');
    expect(without.body.error).not.toHaveProperty('details');
  });

  test.each([
    [new InvalidValueError('Quantity must be a positive integer'), 400, 'INVALID_VALUE'],
    [
      new InvariantViolationError('Payments must sum to the order total'),
      409,
      'INVARIANT_VIOLATION',
    ],
    [new InvalidStateTransitionError('Order is CLOSED'), 409, 'INVALID_STATE_TRANSITION'],
    [new DomainError('Something else'), 400, 'DOMAIN_ERROR'],
  ])('maps %p to its status without logging it as a failure', (error, status, code) => {
    const { logger, error: logged } = createLogger();

    const response = toErrorResponse(error, 'req-3', logger);

    expect(response.status).toBe(status);
    expect(response.body.error).toMatchObject({ code, message: error.message, requestId: 'req-3' });
    expect(logged).not.toHaveBeenCalled();
  });

  test('omits the request id of a domain error when there is none', () => {
    const { logger } = createLogger();

    const { body } = toErrorResponse(new InvalidValueError('Bad'), undefined, logger);

    expect(body.error).not.toHaveProperty('requestId');
  });

  test('hides the cause of an unexpected error and logs it', () => {
    const { logger, error } = createLogger();
    const cause = new Error('connection string postgres://user:secret@host/db is invalid');

    const { status, body } = toErrorResponse(cause, 'req-2', logger);

    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.requestId).toBe('req-2');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('omits the request id of an unexpected error when there is none', () => {
    const { logger } = createLogger();

    const { body } = toErrorResponse('boom', undefined, logger);

    expect(body.error).not.toHaveProperty('requestId');
  });
});

describe('validation errors from zod', () => {
  const schema = z.object({ name: z.string().min(2), nested: z.object({ qty: z.number() }) });

  test('flattens issues into path and message', () => {
    const result = schema.safeParse({ name: 'a', nested: { qty: 'x' } });
    if (result.success) {
      throw new Error('expected a validation failure');
    }

    const details = zodDetails(result.error);

    expect(details.map((detail) => detail.path)).toEqual(['name', 'nested.qty']);
    expect(details.every((detail) => detail.message.length > 0)).toBe(true);
  });

  test('wraps them in a 400 error', () => {
    const result = schema.safeParse({});
    if (result.success) {
      throw new Error('expected a validation failure');
    }

    const error = toValidationError(result.error);

    expect(error.status).toBe(400);
    expect(Array.isArray(error.details)).toBe(true);
  });
});
