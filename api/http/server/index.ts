import { getPort } from "@/app/config/env";
import { routes } from "../routes";

export function startServer(port = getPort()) {
  return Bun.serve({
    port,
    routes,
    fetch() {
      return Response.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Route not found",
          },
        },
        { status: 404 },
      );
    },
  });
}
