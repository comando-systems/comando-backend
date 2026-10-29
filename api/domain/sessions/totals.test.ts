import { describe, expect, test } from "bun:test";
import { calculateSessionTotals } from "./totals";

describe("session totals", () => {
  test("sums active items using their historical unit price", () => {
    const totals = calculateSessionTotals(
      [
        { unitPrice: "10.50", quantity: "2.000", status: "ACTIVE" },
        { unitPrice: "5.00", quantity: "1.000", status: "ACTIVE" },
      ],
      [],
    );

    expect(totals.itemsCents).toBe(2600);
    expect(totals.paidCents).toBe(0);
    expect(totals.balanceCents).toBe(2600);
  });

  test("ignores removed items", () => {
    const totals = calculateSessionTotals(
      [
        { unitPrice: "10.00", quantity: "1.000", status: "ACTIVE" },
        { unitPrice: "99.00", quantity: "1.000", status: "REMOVED" },
      ],
      [],
    );

    expect(totals.itemsCents).toBe(1000);
  });

  test("aggregates multiple payments", () => {
    const totals = calculateSessionTotals(
      [{ unitPrice: "10.00", quantity: "1.000", status: "ACTIVE" }],
      [{ amount: "4.00" }, { amount: "6.00" }],
    );

    expect(totals.paidCents).toBe(1000);
    expect(totals.balanceCents).toBe(0);
  });

  test("supports fractional quantities", () => {
    const totals = calculateSessionTotals(
      [{ unitPrice: "12.00", quantity: "0.500", status: "ACTIVE" }],
      [],
    );

    expect(totals.itemsCents).toBe(600);
  });
});
