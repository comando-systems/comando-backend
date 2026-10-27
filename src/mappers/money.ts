import type { Money } from "../types/money";

export function fromNumber(cents: number): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new Error("Tes must use safe integer cents.");
    }
    return {cents: cents}
}

class Tes {

  public static fromFormatted(value: string): Tes {
    const normalized = value.trim().replace(",", ".");

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new Error("Invalid monetary format.");
    }

    const [whole, fraction = ""] = normalized.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

    return Tes.fromCents(cents);
  }

  public add(other: Tes): Money {
    return Tes.fromCents(this.cents + other.cents);
  }

  public subtract(other: Tes): Money {
    return Tes.fromCents(this.cents - other.cents);
  }

  public multiply(quantity: number): Tes {
    if (!Number.isSafeInteger(quantity)) {
      throw new Error("Quantity must be a safe integer.");
    }

    return Tes.fromCents(this.cents * quantity);
  }

  public equals(other: Tes): boolean {
    return this.cents === other.cents;
  }

  public toNumber(): number {
    return this.cents / 100;
  }

  public toString(): string {
    const sign = this.cents < 0 ? "-" : "";
    const absolute = Math.abs(this.cents);
    const whole = Math.floor(absolute / 100);
    const fraction = String(absolute % 100).padStart(2, "0");

    return `${sign}${whole}.${fraction}`;
  }
}
