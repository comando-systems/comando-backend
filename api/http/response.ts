// Small response helpers that keep status handling consistent across routes.

/** Serializes a JSON response with an explicit status code. */
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Returns an empty 204 response for successful mutations with no body. */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}
