// Regression coverage for PostgreSQL error detection across driver shapes.
import { describe, expect, test } from "bun:test";
import { isUniqueViolation } from ".";

describe("isUniqueViolation", () => {
  test("detects the SQLSTATE exposed by Bun SQL", () => {
    expect(
      isUniqueViolation({
        errno: "23505",
        code: "ERR_POSTGRES_SERVER_ERROR",
      }),
    ).toBe(true);
  });

  test("detects a plain SQLSTATE code", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  test("ignores unrelated errors", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation({ errno: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
