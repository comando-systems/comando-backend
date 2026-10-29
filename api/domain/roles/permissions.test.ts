import { describe, expect, test } from "bun:test";
import {
  PERMISSIONS,
  can,
  isRoleName,
  permissionsFor,
} from "./permissions";

describe("role permissions", () => {
  test("ADMIN has every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(can(["ADMIN"], permission)).toBe(true);
    }
  });

  test("CAIXA can receive payments and close sessions but cannot manage users or products", () => {
    expect(can(["CAIXA"], "payments:create")).toBe(true);
    expect(can(["CAIXA"], "payments:read")).toBe(true);
    expect(can(["CAIXA"], "sessions:close")).toBe(true);
    expect(can(["CAIXA"], "products:read")).toBe(true);
    expect(can(["CAIXA"], "products:manage")).toBe(false);
    expect(can(["CAIXA"], "users:manage")).toBe(false);
    expect(can(["CAIXA"], "sessions:cancel")).toBe(false);
  });

  test("GARCOM can manage items but cannot receive payments or close sessions", () => {
    expect(can(["GARCOM"], "items:manage")).toBe(true);
    expect(can(["GARCOM"], "sessions:open")).toBe(true);
    expect(can(["GARCOM"], "sessions:read")).toBe(true);
    expect(can(["GARCOM"], "payments:create")).toBe(false);
    expect(can(["GARCOM"], "payments:read")).toBe(false);
    expect(can(["GARCOM"], "sessions:close")).toBe(false);
    expect(can(["GARCOM"], "users:manage")).toBe(false);
  });

  test("permissions from multiple roles are combined", () => {
    const permissions = permissionsFor(["CAIXA", "GARCOM"]);

    expect(permissions.has("payments:create")).toBe(true);
    expect(permissions.has("items:manage")).toBe(true);
  });

  test("unknown roles are ignored", () => {
    expect(can(["UNKNOWN"], "sessions:read")).toBe(false);
    expect(permissionsFor(["UNKNOWN"]).size).toBe(0);
  });

  test("recognizes only supported role names", () => {
    expect(isRoleName("ADMIN")).toBe(true);
    expect(isRoleName("CAIXA")).toBe(true);
    expect(isRoleName("GARCOM")).toBe(true);
    expect(isRoleName("admin")).toBe(false);
  });
});
