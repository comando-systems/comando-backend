import { describe, expect, test } from 'bun:test';
import { Category, normalizeCategoryName } from '@/domain/entity/category';
import { InvalidValueError } from '@/domain/errors';
import { CategoryID } from '@/domain/value-objects/ids';

describe('Category', () => {
  test('normalizes the name and keeps its typed id', () => {
    const category = Category.create({ id: new CategoryID('7'), name: '  Drinks  ' });

    expect(category.id).toEqual(new CategoryID('7'));
    expect(category.name).toBe('Drinks');
    expect(normalizeCategoryName(' Cold ')).toBe('Cold');
  });

  test('rejects blank and oversized names', () => {
    expect(() => Category.create({ id: new CategoryID('1'), name: '   ' })).toThrow(
      InvalidValueError,
    );
    expect(() => Category.create({ id: new CategoryID('1'), name: 'x'.repeat(81) })).toThrow(
      InvalidValueError,
    );
  });
});
