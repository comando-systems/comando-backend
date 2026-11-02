import { describe, expect, test } from 'bun:test';
import { ValueObject } from '@/domain/value-objects/value-object';

class Code extends ValueObject<string> {
  constructor(value: string) {
    super(value);
  }
}

class OtherCode extends ValueObject<string> {
  constructor(value: string) {
    super(value);
  }
}

class Point extends ValueObject<{ x: number; y: number }> {
  constructor(x: number, y: number) {
    super({ x, y });
  }
}

describe('ValueObject', () => {
  test('compares values with the same runtime type', () => {
    expect(new Code('A').equals(new Code('A'))).toBe(true);
    expect(new Code('A').equals(new Code('B'))).toBe(false);
    expect(new Code('A').equals(null)).toBe(false);
    expect(new Code('A').equals(undefined)).toBe(false);
  });

  test('does not consider different value object types equal', () => {
    expect(new Code('A').equals(new OtherCode('A') as unknown as Code)).toBe(false);
  });

  test('freezes object props', () => {
    const point = new Point(1, 2);

    expect(Object.isFrozen(point.value)).toBe(true);
    expect(point.value).toEqual({ x: 1, y: 2 });
  });
});
