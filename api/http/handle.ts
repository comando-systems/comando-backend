// Wraps route handlers so thrown errors become the standard API error response.
import { toErrorResponse } from "@/app/errors";

/** Adapts a handler into one that never rejects, preserving typed error mapping. */
export function handle<Path extends string>(
  work: (request: Bun.BunRequest<Path>) => Promise<Response> | Response,
): (request: Bun.BunRequest<Path>) => Promise<Response> {
  return async (request) => {
    try {
      return await work(request);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
