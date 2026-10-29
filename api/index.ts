import { getJwtSecret } from "@/app/config/env";
import { startServer } from "./http/server";

// Fail fast when required runtime configuration is missing.
getJwtSecret();
startServer();
