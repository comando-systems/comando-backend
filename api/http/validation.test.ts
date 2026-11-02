// Unit tests for request field validation and query-parameter parsing.
import { describe, expect, test } from "bun:test";
import {
  Input,
  parseBooleanParam,
  parseEnumParam,
  parseId,
  readJson,
} from "./validation";

function expectFieldError(work: () => void, field: string): void {
  try {
    work();
  } catch (error) {
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { field },
    });
    return;
  }

  throw new Error(`Expected validation error for field ${field}`);
}

describe("Input", () => {
  test("rejects non-object bodies", () => {
    expect(() => new Input(null)).toThrow();
    expect(() => new Input([])).toThrow();
    expect(() => new Input("text")).toThrow();
  });

  test("validates and trims strings", () => {
    const input = new Input({ name: "  Pizza  ", email: " USER@EXAMPLE.COM " });

    expect(input.string("name", { min: 2, max: 10 })).toBe("Pizza");
    expect(input.email()).toBe("user@example.com");
  });

  test("reports the offending field", () => {
    const input = new Input({ name: "x" });

    expectFieldError(() => input.string("name", { min: 2 }), "name");
    expectFieldError(() => input.integer("age"), "age");
    expectFieldError(() => input.enum("status", ["OPEN", "CLOSED"]), "status");
  });

  test("supports optional and nullable fields", () => {
    const input = new Input({ notes: null, description: "ok" });

    expect(input.optionalString("missing")).toBeUndefined();
    expect(input.nullableString("notes")).toBeNull();
    expect(input.nullableString("missing")).toBeUndefined();
    expect(input.optionalString("description")).toBe("ok");
  });

  test("validates decimals and their scale", () => {
    const input = new Input({ quantity: 1.5, invalid: 1.2345 });

    expect(input.decimal("quantity", { min: 0.001, scale: 3 })).toBe(1.5);
    expectFieldError(() => input.decimal("invalid", { scale: 3 }), "invalid");
  });

  test("validates string arrays", () => {
    const input = new Input({ roles: ["ADMIN", " CAIXA "] });

    expect(input.stringArray("roles", { minLength: 1 })).toEqual([
      "ADMIN",
      "CAIXA",
    ]);
    expectFieldError(() => input.stringArray("roles", { minLength: 3 }), "roles");
  });
});

describe("request helpers", () => {
  test("parses JSON bodies", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    expect(await readJson(request)).toEqual({ ok: true });
  });

  test("treats an empty body as an empty object", async () => {
    const request = new Request("http://localhost", { method: "POST" });
    expect(await readJson(request)).toEqual({});
  });

  test("rejects invalid JSON", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "{",
    });

    await expect(readJson(request)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  test("parses route ids", () => {
    expect(parseId("42")).toBe(42);
    expect(() => parseId("0")).toThrow();
    expect(() => parseId("abc")).toThrow();
    expect(() => parseId(undefined)).toThrow();
  });

  test("parses enum and boolean query parameters", () => {
    expect(parseEnumParam("OPEN", ["OPEN", "CLOSED"], "status")).toBe("OPEN");
    expect(parseEnumParam(null, ["OPEN"], "status")).toBeUndefined();
    expect(() => parseEnumParam("X", ["OPEN"], "status")).toThrow();
    expect(parseBooleanParam("true", "active")).toBe(true);
    expect(parseBooleanParam("false", "active")).toBe(false);
    expect(parseBooleanParam(null, "active")).toBeUndefined();
    expect(() => parseBooleanParam("yes", "active")).toThrow();
  });
});
