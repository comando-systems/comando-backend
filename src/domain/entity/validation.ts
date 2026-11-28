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

function isValidEmail(value: string): boolean {
  const at = value.indexOf('@');

  if (at <= 0 || at !== value.lastIndexOf('@')) {
    return false;
  }

  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');

  return dot > 0 && dot < domain.length - 1 && !/\s/.test(value);
}

export function normalizeEmail(value: string): string {
  const normalized = requireNonEmptyString(value, 'Email', 254).toLowerCase();

  if (!isValidEmail(normalized)) {
    throw new InvalidValueError('Email is invalid');
  }

  return normalized;
}
