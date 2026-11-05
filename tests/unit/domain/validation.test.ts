import { describe, expect, test } from 'bun:test';
import {
  normalizeEmail,
  requireNonEmptyString,
  requirePositiveInteger,
  requireValidDate,
} from '@/domain/entity/validation';
import { InvalidValueError } from '@/domain/errors';

describe('validation helpers', () => {
  test('trims strings and enforces the maximum length', () => {
    expect(requireNonEmptyString('  Ada  ', 'Name')).toBe('Ada');
    expect(() => requireNonEmptyString('   ', 'Name')).toThrow(InvalidValueError);
    expect(() => requireNonEmptyString('abcd', 'Name', 3)).toThrow('at most 3 characters');
  });

  test('accepts only positive safe integers', () => {
    expect(requirePositiveInteger(3, 'Quantity')).toBe(3);
    for (const bad of [0, -1, 1.5, Number.NaN, 2 ** 60]) {
      expect(() => requirePositiveInteger(bad, 'Quantity')).toThrow(InvalidValueError);
    }
  });

  test('returns a copy of a valid date and rejects invalid ones', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const copy = requireValidDate(date, 'Now');

    expect(copy).toEqual(date);
    expect(copy).not.toBe(date);
    expect(() => requireValidDate(new Date('nope'), 'Now')).toThrow('valid date');
    expect(() => requireValidDate('2026-01-01' as unknown as Date, 'Now')).toThrow(
      InvalidValueError,
    );
  });

  test('lower-cases and validates emails', () => {
    expect(normalizeEmail(' ADA@Example.com ')).toBe('ada@example.com');
    expect(() => normalizeEmail('not-an-email')).toThrow(InvalidValueError);
  });
});
