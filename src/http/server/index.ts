import { routes } from "../routes";

export function startServer(port = 8080) {
  return Bun.serve({
    port,
    routes,
    fetch() {
      return new Response("Unmatched route", { status: 404 });
    },
  });
}
