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
