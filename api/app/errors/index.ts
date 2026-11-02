// Error serialization and PostgreSQL error helpers.

import { AppError } from "./app-error";

export * from "./app-error";

/** Converts unknown errors into the API envelope without leaking internals. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      { status: error.status },
    );
  }

  console.error("Unhandled error", error);

  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    },
    { status: 500 },
  );
}

/** Detects PostgreSQL unique constraint violations (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  // Bun SQL exposes the SQLSTATE in `errno`; `code` stays as its own error code.
  return (
    ("code" in error && error.code === "23505") ||
    ("errno" in error && error.errno === "23505")
  );
}
