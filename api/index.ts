// Application entrypoint: validate configuration before accepting traffic.
import { getJwtSecret, getPort } from "@/app/config/env";
import { NotFoundError, toErrorResponse } from "@/app/errors";
import { routes } from "./http/routes";

// Fail fast when required runtime configuration is missing.
getJwtSecret();

Bun.serve({
  port: getPort(),
  routes,
  fetch() {
    return toErrorResponse(new NotFoundError("Route not found"));
  },
});
