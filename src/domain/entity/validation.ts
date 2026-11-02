import { InvalidValueError } from '@/domain/errors';

export function requireNonEmptyString(value: string, field: string, maxLength?: number): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new InvalidValueError(`${field} is required`);
  }

  if (maxLength !== undefined && normalized.length > maxLength) {
    throw new InvalidValueError(`${field} must have at most ${maxLength} characters`);
  }

  return normalized;
}

export function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidValueError(`${field} must be a positive integer`);
  }

  return value;
}

export function requireValidDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidValueError(`${field} must be a valid date`);
  }

  return new Date(value.getTime());
}

export function normalizeEmail(value: string): string {
  const normalized = requireNonEmptyString(value, 'Email', 254).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new InvalidValueError('Email is invalid');
  }

  return normalized;
}
