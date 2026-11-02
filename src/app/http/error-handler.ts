import type { ZodError } from 'zod';
import { AppError, ValidationError } from '@/app/errors';
import type { Logger } from '@/app/ports/logger';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function zodDetails(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function toValidationError(error: ZodError): ValidationError {
  return new ValidationError('Invalid request', zodDetails(error));
}

export function toErrorResponse(
  error: unknown,
  requestId: string | undefined,
  logger: Logger,
): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
          ...(requestId === undefined ? {} : { requestId }),
        },
      },
    };
  }

  logger.error('unhandled request error', error, { requestId });

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        ...(requestId === undefined ? {} : { requestId }),
      },
    },
  };
}
