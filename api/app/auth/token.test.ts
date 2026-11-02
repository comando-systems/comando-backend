// Unit tests for token signing, verification, tampering, and expiry.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { expectCode } from "@/test/assertions";
import { signToken, verifyToken } from "./token";

const secret = "test-secret-with-enough-entropy";

beforeAll(() => {
  process.env.JWT_SECRET = secret;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

describe("auth tokens", () => {
  test("signs and verifies a token", () => {
    const token = signToken(7, 60);
    const payload = verifyToken(token);

    expect(payload.sub).toBe(7);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  test("rejects tampered tokens", () => {
    const token = signToken(7, 60);
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature}x`;

    expectCode(() => verifyToken(tampered), "UNAUTHORIZED");
  });

  test("rejects malformed tokens", () => {
    expect(() => verifyToken("not-a-token")).toThrow();
    expect(() => verifyToken("")).toThrow();
    expect(() => verifyToken("a.b.c")).toThrow();
  });

  test("rejects expired tokens", () => {
    const token = signToken(7, 0);

    expectCode(() => verifyToken(token), "UNAUTHORIZED");
  });

  test("requires a configured secret", () => {
    delete process.env.JWT_SECRET;

    try {
      expect(() => signToken(1, 60)).toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = secret;
    }
  });
});
