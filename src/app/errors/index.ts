export interface AppErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super({ status: 400, code: 'VALIDATION_ERROR', message, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super({ status: 401, code: 'UNAUTHORIZED', message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to perform this action') {
    super({ status: 403, code: 'FORBIDDEN', message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super({ status: 404, code: 'NOT_FOUND', message });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The resource cannot be changed in its current state') {
    super({ status: 409, code: 'CONFLICT', message });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request payload too large') {
    super({ status: 413, code: 'PAYLOAD_TOO_LARGE', message });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super({ status: 429, code: 'TOO_MANY_REQUESTS', message });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable') {
    super({ status: 503, code: 'SERVICE_UNAVAILABLE', message });
  }
}
