import { describe, expect, test } from 'bun:test';
import { Item } from '@/domain/entity/item';
import { InvalidValueError, InvariantViolationError } from '@/domain/errors';
import { ItemID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');
const later = new Date('2026-01-02T12:00:00.000Z');

function createItem(overrides: Partial<Parameters<typeof Item.create>[0]> = {}): Item {
  return Item.create({
    id: new ItemID('1'),
    name: 'Coffee',
    description: 'Fresh coffee',
    priceCents: 750,
    imageUrl: null,
    now,
    ...overrides,
  });
}

describe('Item', () => {
  test('creates an active item with integer-cent price', () => {
    const item = createItem();

    expect(item.isActive).toBe(true);
    expect(item.price.cents).toBe(750);
    expect(item.name).toBe('Coffee');
  });

  test('rejects invalid item data', () => {
    expect(() => createItem({ name: ' ' })).toThrow(InvalidValueError);
    expect(() => createItem({ priceCents: -1 })).toThrow(InvalidValueError);
    expect(() => createItem({ priceCents: 1.5 })).toThrow(InvalidValueError);
  });

  test('updates catalog data', () => {
    const item = createItem();
    const later = new Date('2026-01-02T12:00:00.000Z');

    item.update({ name: 'Espresso', priceCents: 900, description: null, now: later });

    expect(item.name).toBe('Espresso');
    expect(item.price.cents).toBe(900);
    expect(item.description).toBeNull();
    expect(item.updatedAt).toEqual(later);
  });

  test('soft removes items and prevents further edits', () => {
    const item = createItem();
    const later = new Date('2026-01-02T12:00:00.000Z');

    item.remove(later);

    expect(item.isActive).toBe(false);
    expect(item.deletedAt).toEqual(later);
    expect(() => item.remove(later)).toThrow(InvariantViolationError);
    expect(() => item.update({ name: 'Other', now: later })).toThrow(InvariantViolationError);
  });

  test('defaults the category and the enabled flag', () => {
    const item = createItem();

    expect(item.category).toBe('Uncategorized');
    expect(item.isEnabled).toBe(true);
    expect(item.isSellable).toBe(true);
  });

  test('keeps a disabled item editable but not sellable', () => {
    const item = createItem({ category: 'Drinks', active: false });

    expect(item.category).toBe('Drinks');
    expect(item.isEnabled).toBe(false);
    expect(item.isSellable).toBe(false);
    expect(item.isActive).toBe(true);

    item.update({ category: 'Beer', active: true, now: later });

    expect(item.category).toBe('Beer');
    expect(item.isSellable).toBe(true);
  });

  test('a removed item is never sellable, even when enabled', () => {
    const item = createItem();

    item.remove(later);

    expect(item.isEnabled).toBe(true);
    expect(item.isSellable).toBe(false);
  });

  test('rejects a blank or oversized category', () => {
    expect(() => createItem({ category: '   ' })).toThrow(InvalidValueError);
    expect(() => createItem({ category: 'x'.repeat(81) })).toThrow(InvalidValueError);
    expect(() => createItem().update({ category: ' ', now: later })).toThrow(InvalidValueError);
  });

  test('defaults the category and the enabled flag', () => {
    const item = createItem();

    expect(item.category).toBe('Uncategorized');
    expect(item.isEnabled).toBe(true);
    expect(item.isSellable).toBe(true);
  });

  test('keeps a disabled item editable but not sellable', () => {
    const item = createItem({ category: 'Drinks', active: false });

    expect(item.category).toBe('Drinks');
    expect(item.isEnabled).toBe(false);
    expect(item.isSellable).toBe(false);
    expect(item.isActive).toBe(true);

    item.update({ category: 'Beer', active: true, now: later });

    expect(item.category).toBe('Beer');
    expect(item.isSellable).toBe(true);
  });

  test('a removed item is never sellable, even when enabled', () => {
    const item = createItem();

    item.remove(later);

    expect(item.isEnabled).toBe(true);
    expect(item.isSellable).toBe(false);
  });

  test('rejects a blank or oversized category', () => {
    expect(() => createItem({ category: '   ' })).toThrow(InvalidValueError);
    expect(() => createItem({ category: 'x'.repeat(81) })).toThrow(InvalidValueError);
    expect(() => createItem().update({ category: ' ', now: later })).toThrow(InvalidValueError);
  });
});
