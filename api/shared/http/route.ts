import { toErrorResponse } from "@/app/errors";

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
