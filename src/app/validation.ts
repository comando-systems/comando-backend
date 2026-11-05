import { ValidationError } from '@/app/errors';

export function requirePage(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError('Page must be a positive integer');
  }

  return value;
}

export function requirePageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new ValidationError('Page size must be between 1 and 100');
  }

  return value;
}

export function requireOptionalDate(value: Date | undefined, field: string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
  }

  return new Date(value.getTime());
}
