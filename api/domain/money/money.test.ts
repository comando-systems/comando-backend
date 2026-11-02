// Unit tests for integer-cent money conversions and locale formatting.
import { describe, expect, test } from "bun:test";
import {
  MoneyAmount,
  centsToDecimal,
  decimalToCents,
  subtotalCents,
} from ".";

describe("decimal money helpers", () => {
  test("converts decimal strings to cents without floating point drift", () => {
    expect(decimalToCents("10.50")).toBe(1050);
    expect(decimalToCents("0.99")).toBe(99);
    expect(decimalToCents("0.05")).toBe(5);
    expect(decimalToCents("100")).toBe(10_000);
    expect(decimalToCents("-1.25")).toBe(-125);
  });

  test("rejects malformed decimal strings", () => {
    expect(() => decimalToCents("10,50")).toThrow();
    expect(() => decimalToCents("10.999")).toThrow();
    expect(() => decimalToCents("abc")).toThrow();
  });

  test("formats cents as decimal strings", () => {
    expect(centsToDecimal(1050)).toBe("10.50");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(0)).toBe("0.00");
    expect(centsToDecimal(-5)).toBe("-0.05");
  });

  test("rounds subtotals with fractional quantities to whole cents", () => {
    expect(subtotalCents(1050, 2)).toBe(2100);
    expect(subtotalCents(1000, 0.5)).toBe(500);
    expect(subtotalCents(999, 1.001)).toBe(1000);
  });
});

describe("MoneyAmount", () => {
  test("parses localized monetary input", () => {
    expect(MoneyAmount.fromFormatted("10,50").cents).toBe(1050);
    expect(MoneyAmount.fromFormatted(" 7.9 ").cents).toBe(790);
  });

  test("rejects invalid monetary input", () => {
    expect(() => MoneyAmount.fromFormatted("1.234")).toThrow();
    expect(() => MoneyAmount.fromFormatted("abc")).toThrow();
  });

  test("adds, subtracts and compares amounts", () => {
    const amount = MoneyAmount.fromCents(1000);

    expect(amount.add(MoneyAmount.fromCents(250)).cents).toBe(1250);
    expect(amount.subtract({ cents: 400 }).cents).toBe(600);
    expect(amount.equals({ cents: 1000 })).toBe(true);
    expect(amount.toString()).toBe("10.00");
  });
});
