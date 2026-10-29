import { createHmac, timingSafeEqual } from "node:crypto";
import { getJwtSecret, getTokenTtlSeconds } from "@/app/config/env";
import { UnauthorizedError } from "@/app/errors";

export interface TokenPayload {
  sub: number;
  iat: number;
  exp: number;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getJwtSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function isTokenPayload(value: unknown): value is TokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("sub" in value) || !("iat" in value) || !("exp" in value)) {
    return false;
  }

  return (
    typeof value.sub === "number" &&
    Number.isSafeInteger(value.sub) &&
    value.sub > 0 &&
    typeof value.iat === "number" &&
    typeof value.exp === "number"
  );
}

export function signToken(
  userId: number,
  ttlSeconds: number = getTokenTtlSeconds(),
): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("User id must be a positive integer");
  }

  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 0) {
    throw new Error("Token TTL must be a non-negative integer");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: userId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  };
  const encodedPayload = encode(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyToken(token: string): TokenPayload {
  const [encodedPayload, signature, ...rest] = token.split(".");

  if (!encodedPayload || !signature || rest.length > 0) {
    throw new UnauthorizedError("Invalid token");
  }

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new UnauthorizedError("Invalid token");
  }

  let payload: unknown;

  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    throw new UnauthorizedError("Invalid token");
  }

  if (!isTokenPayload(payload)) {
    throw new UnauthorizedError("Invalid token");
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedError("Token expired");
  }

  return payload;
}
