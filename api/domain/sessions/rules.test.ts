// Unit tests for session lifecycle and table-assignment invariants.
import { describe, expect, test } from "bun:test";
import { assertPaymentAllowed } from "@/domain/payments";
import { expectCode } from "@/test/assertions";
import {
  assertSessionCanBeCancelled,
  assertSessionOpen,
  assertSessionSettled,
  assertTableAssignment,
} from ".";

describe("session rules", () => {
  test("only open sessions accept modifications", () => {
    expect(() => assertSessionOpen({ status: "OPEN" })).not.toThrow();
    expectCode(() => assertSessionOpen({ status: "CLOSED" }), "SESSION_NOT_OPEN");
    expectCode(
      () => assertSessionOpen({ status: "CANCELLED" }),
      "SESSION_NOT_OPEN",
    );
  });

  test("table sessions require a table number and counter sessions forbid it", () => {
    expect(() =>
      assertTableAssignment({ type: "TABLE", tableNumber: 4 }),
    ).not.toThrow();
    expect(() => assertTableAssignment({ type: "COUNTER" })).not.toThrow();
    expectCode(
      () => assertTableAssignment({ type: "TABLE" }),
      "VALIDATION_ERROR",
    );
    expectCode(
      () => assertTableAssignment({ type: "COUNTER", tableNumber: 4 }),
      "VALIDATION_ERROR",
    );
  });

  test("sessions can only be closed when fully settled", () => {
    expect(() =>
      assertSessionSettled({
        itemsCents: 1000,
        paidCents: 1000,
        balanceCents: 0,
      }),
    ).not.toThrow();

    expectCode(
      () =>
        assertSessionSettled({
          itemsCents: 1000,
          paidCents: 400,
          balanceCents: 600,
        }),
      "OUTSTANDING_BALANCE",
    );
  });

  test("sessions with payments cannot be cancelled", () => {
    expect(() => assertSessionCanBeCancelled(0)).not.toThrow();
    expectCode(() => assertSessionCanBeCancelled(1), "SESSION_HAS_PAYMENTS");
  });
});

describe("payment rules", () => {
  const unpaid = {
    itemsCents: 1000,
    paidCents: 0,
    balanceCents: 1000,
  };

  test("accepts partial and exact payments", () => {
    expect(() => assertPaymentAllowed(unpaid, 400)).not.toThrow();
    expect(() => assertPaymentAllowed(unpaid, 1000)).not.toThrow();
  });

  test("rejects payments above the outstanding balance", () => {
    expectCode(
      () => assertPaymentAllowed(unpaid, 1001),
      "PAYMENT_EXCEEDS_BALANCE",
    );
  });

  test("rejects payments for empty or already paid sessions", () => {
    expectCode(
      () =>
        assertPaymentAllowed(
          { itemsCents: 0, paidCents: 0, balanceCents: 0 },
          100,
        ),
      "SESSION_HAS_NO_ITEMS",
    );

    expectCode(
      () =>
        assertPaymentAllowed(
          { itemsCents: 1000, paidCents: 1000, balanceCents: 0 },
          100,
        ),
      "SESSION_ALREADY_PAID",
    );
  });
});
