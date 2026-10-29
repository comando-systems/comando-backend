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

export function getDatabaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

export function getJwtSecret(): string {
  return requireEnv("JWT_SECRET");
}

export function getPort(): number {
  return readPositiveInteger("PORT", 8080);
}

export function getTokenTtlSeconds(): number {
  return readPositiveInteger("TOKEN_TTL_SECONDS", 28_800);
}
