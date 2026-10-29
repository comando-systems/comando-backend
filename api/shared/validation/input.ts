import { ValidationError } from "@/app/errors";

interface StringOptions {
  min?: number;
  max?: number;
  pattern?: RegExp;
  trim?: boolean;
}

interface NumberOptions {
  min?: number;
  max?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(field: string, message: string): never {
  throw new ValidationError(message, field);
}

/**
 * Reads and validates an untrusted JSON object field by field.
 * Unknown fields are ignored; every consumed field is validated explicitly.
 */
export class Input {
  private readonly data: Record<string, unknown>;

  constructor(value: unknown, label = "body") {
    if (!isRecord(value)) {
      throw new ValidationError(`${label} must be an object`);
    }

    this.data = value;
  }

  private raw(field: string): unknown {
    return this.data[field];
  }

  private isPresent(field: string): boolean {
    return this.raw(field) !== undefined && this.raw(field) !== null;
  }

  string(field: string, options: StringOptions = {}): string {
    const raw = this.raw(field);

    if (typeof raw !== "string") {
      fail(field, "must be a string");
    }

    const value = options.trim === false ? raw : raw.trim();

    if (options.min !== undefined && value.length < options.min) {
      fail(field, `must have at least ${options.min} characters`);
    }

    if (options.max !== undefined && value.length > options.max) {
      fail(field, `must have at most ${options.max} characters`);
    }

    if (options.pattern && !options.pattern.test(value)) {
      fail(field, "has an invalid format");
    }

    return value;
  }

  optionalString(field: string, options: StringOptions = {}): string | undefined {
    return this.isPresent(field) ? this.string(field, options) : undefined;
  }

  nullableString(
    field: string,
    options: StringOptions = {},
  ): string | null | undefined {
    if (this.raw(field) === null) {
      return null;
    }

    return this.optionalString(field, options);
  }

  email(field = "email"): string {
    return this.string(field, {
      min: 3,
      max: 255,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    }).toLowerCase();
  }

  optionalEmail(field = "email"): string | undefined {
    return this.isPresent(field) ? this.email(field) : undefined;
  }

  boolean(field: string): boolean {
    const raw = this.raw(field);

    if (typeof raw !== "boolean") {
      fail(field, "must be a boolean");
    }

    return raw;
  }

  optionalBoolean(field: string): boolean | undefined {
    return this.isPresent(field) ? this.boolean(field) : undefined;
  }

  integer(field: string, options: NumberOptions = {}): number {
    const raw = this.raw(field);

    if (typeof raw !== "number" || !Number.isSafeInteger(raw)) {
      fail(field, "must be an integer");
    }

    if (options.min !== undefined && raw < options.min) {
      fail(field, `must be greater than or equal to ${options.min}`);
    }

    if (options.max !== undefined && raw > options.max) {
      fail(field, `must be less than or equal to ${options.max}`);
    }

    return raw;
  }

  optionalInteger(
    field: string,
    options: NumberOptions = {},
  ): number | undefined {
    return this.isPresent(field) ? this.integer(field, options) : undefined;
  }

  number(field: string, options: NumberOptions = {}): number {
    const raw = this.raw(field);

    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      fail(field, "must be a number");
    }

    if (options.min !== undefined && raw < options.min) {
      fail(field, `must be greater than or equal to ${options.min}`);
    }

    if (options.max !== undefined && raw > options.max) {
      fail(field, `must be less than or equal to ${options.max}`);
    }

    return raw;
  }

  decimal(
    field: string,
    options: NumberOptions & { scale?: number } = {},
  ): number {
    const raw = this.raw(field);

    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      fail(field, "must be a number");
    }

    const scale = options.scale ?? 3;

    if (raw < 0 || !new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(String(raw))) {
      fail(field, `must be a positive decimal with at most ${scale} places`);
    }

    if (options.min !== undefined && raw < options.min) {
      fail(field, `must be greater than or equal to ${options.min}`);
    }

    if (options.max !== undefined && raw > options.max) {
      fail(field, `must be less than or equal to ${options.max}`);
    }

    return raw;
  }

  enum<T extends string>(field: string, values: readonly T[]): T {
    const raw = this.raw(field);

    if (typeof raw !== "string") {
      fail(field, `must be one of: ${values.join(", ")}`);
    }

    const match = values.find((value) => value === raw);

    if (match === undefined) {
      fail(field, `must be one of: ${values.join(", ")}`);
    }

    return match;
  }

  stringArray(field: string, options: { minLength?: number } = {}): string[] {
    const raw = this.raw(field);

    if (!Array.isArray(raw)) {
      fail(field, "must be an array of strings");
    }

    const values = raw.map((item, index) => {
      if (typeof item !== "string") {
        fail(`${field}[${index}]`, "must be a string");
      }

      return item.trim();
    });

    if (options.minLength !== undefined && values.length < options.minLength) {
      fail(field, `must contain at least ${options.minLength} item(s)`);
    }

    return values;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();

  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

export function parseId(value: string | undefined, label = "id"): number {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ValidationError("must be a positive integer", label);
  }

  return id;
}

export function parseEnumParam<T extends string>(
  value: string | null,
  values: readonly T[],
  field: string,
): T | undefined {
  if (value === null) {
    return undefined;
  }

  const match = values.find((candidate) => candidate === value);

  if (match === undefined) {
    throw new ValidationError(`must be one of: ${values.join(", ")}`, field);
  }

  return match;
}

export function parseBooleanParam(
  value: string | null,
  field: string,
): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ValidationError("must be 'true' or 'false'", field);
}
