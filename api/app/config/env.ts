// Runtime configuration read from environment variables and validated on use.

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

/** Returns the required PostgreSQL connection URL. */
export function getDatabaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

/** Returns the required secret used to sign authentication tokens. */
export function getJwtSecret(): string {
  return requireEnv("JWT_SECRET");
}

/** Returns the HTTP port, defaulting to 8080. */
export function getPort(): number {
  return readPositiveInteger("PORT", 8080);
}

/** Returns the token lifetime in seconds, defaulting to 8 hours. */
export function getTokenTtlSeconds(): number {
  return readPositiveInteger("TOKEN_TTL_SECONDS", 28_800);
}
