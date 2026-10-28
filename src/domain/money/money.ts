import type { Money } from "./types";

export function fromNumber(cents: number): Money {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Amount must be a safe integer in cents.");
  }
  return { cents };
}

export function fromCents(cents: number): Money {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Amount must be a safe integer in cents.");
  }
  return { cents };
}

export class MoneyAmount {
  readonly cents: number;

  constructor(cents: number) {
    if (!Number.isSafeInteger(cents)) {
      throw new Error("Amount must be a safe integer in cents.");
    }
    this.cents = cents;
  }

  static fromNumber(cents: number): MoneyAmount {
    return new MoneyAmount(cents);
  }

  static fromCents(cents: number): MoneyAmount {
    return new MoneyAmount(cents);
  }

  static fromFormatted(value: string): MoneyAmount {
    const normalized = value.trim().replace(",", ".");

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new Error("Invalid monetary format.");
    }

    const [whole, fraction = ""] = normalized.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

    return MoneyAmount.fromCents(cents);
  }

  add(other: MoneyAmount | Money): MoneyAmount {
    const otherCents = "cents" in other ? other.cents : other.cents;
    return MoneyAmount.fromCents(this.cents + otherCents);
  }

  subtract(other: MoneyAmount | Money): MoneyAmount {
    const otherCents = "cents" in other ? other.cents : other.cents;
    return MoneyAmount.fromCents(this.cents - otherCents);
  }

  multiply(quantity: number): MoneyAmount {
    if (!Number.isSafeInteger(quantity)) {
      throw new Error("Quantity must be a safe integer.");
    }
    return MoneyAmount.fromCents(this.cents * quantity);
  }

  equals(other: MoneyAmount | Money): boolean {
    const otherCents = "cents" in other ? other.cents : other.cents;
    return this.cents === otherCents;
  }

  toNumber(): number {
    return this.cents / 100;
  }

  toMoney(): Money {
    return { cents: this.cents };
  }

  toString(): string {
    const sign = this.cents < 0 ? "-" : "";
    const absolute = Math.abs(this.cents);
    const whole = Math.floor(absolute / 100);
    const fraction = String(absolute % 100).padStart(2, "0");
    return `${sign}${whole}.${fraction}`;
  }
}
