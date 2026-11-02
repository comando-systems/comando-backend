// Typed application errors mapped to consistent HTTP responses.

/** Base error carrying an API error code, HTTP status, and optional details. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Invalid request input, optionally tied to a field. */
export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super("VALIDATION_ERROR", message, 400, field ? { field } : undefined);
  }
}

/** Missing or invalid authentication credentials. */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

/** Authenticated actor lacks the required permission. */
export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super("FORBIDDEN", message, 403);
  }
}

/** Requested resource does not exist or is not visible. */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code = "NOT_FOUND") {
    super(code, message, 404);
  }
}

/** Request conflicts with current state or a uniqueness constraint. */
export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
  }
}
