import { requireNonEmptyString, requireValidDate } from '@/domain/entity/validation';
import { InvalidValueError, InvariantViolationError } from '@/domain/errors';
import type { ItemID } from '@/domain/value-objects/ids';
import { Money } from '@/domain/value-objects/money';

// Matches the database default, so legacy rows and callers without a category stay valid.
export const DEFAULT_ITEM_CATEGORY = 'Uncategorized';
export const MAX_ITEM_CATEGORIES = 8;

export interface ItemProps {
  id: ItemID;
  name: string;
  description: string | null;
  // Primary label kept for catalog grouping, search, and legacy clients. It is always
  // the first entry of `categories`, or the default when the item has no categories.
  category: string;
  categories: readonly string[];
  price: Money;
  imageUrl: string | null;
  active: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateItemInput {
  readonly id: ItemID;
  readonly name: string;
  readonly description?: string | null;
  readonly category?: string;
  readonly categories?: readonly string[];
  readonly priceCents: number;
  readonly imageUrl?: string | null;
  readonly active?: boolean;
  readonly now: Date;
}

export interface UpdateItemInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly category?: string;
  readonly categories?: readonly string[];
  readonly priceCents?: number;
  readonly imageUrl?: string | null;
  readonly active?: boolean;
  readonly now: Date;
}

function normalizeOptionalText(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return requireNonEmptyString(normalized, field);
}

function validateCategories(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined || values.length === 0) {
    return [];
  }

  if (values.length > MAX_ITEM_CATEGORIES) {
    throw new InvalidValueError(`Item cannot have more than ${MAX_ITEM_CATEGORIES} categories`);
  }

  const seen = new Set<string>();
  const categories: string[] = [];

  for (const value of values) {
    const name = requireNonEmptyString(value, 'Category', 80);
    const key = name.toLocaleLowerCase();

    if (seen.has(key)) {
      throw new InvalidValueError('Duplicate category');
    }

    seen.add(key);
    categories.push(name);
  }

  return categories;
}

function requireNonNegativePrice(priceCents: number): Money {
  const price = Money.fromCents(priceCents);

  if (price.isNegative()) {
    throw new InvalidValueError('Price cannot be negative');
  }

  return price;
}

export class Item {
  private constructor(private readonly props: ItemProps) {}

  static create(input: CreateItemInput): Item {
    const now = requireValidDate(input.now, 'Now');
    const legacyCategory =
      input.category === undefined || input.category === DEFAULT_ITEM_CATEGORY
        ? []
        : [requireNonEmptyString(input.category, 'Category', 80)];
    const categories = validateCategories(input.categories ?? legacyCategory);

    return new Item({
      id: input.id,
      name: requireNonEmptyString(input.name, 'Name', 160),
      description: normalizeOptionalText(input.description, 'Description'),
      category: categories[0] ?? DEFAULT_ITEM_CATEGORY,
      categories,
      price: requireNonNegativePrice(input.priceCents),
      imageUrl: normalizeOptionalText(input.imageUrl, 'Image URL'),
      active: input.active ?? true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: ItemProps): Item {
    const category = requireNonEmptyString(props.category, 'Category', 80);
    const categories = validateCategories(
      props.categories ?? (category === DEFAULT_ITEM_CATEGORY ? [] : [category]),
    );

    return new Item({
      id: props.id,
      name: requireNonEmptyString(props.name, 'Name', 160),
      description: normalizeOptionalText(props.description, 'Description'),
      category,
      categories,
      price: requireNonNegativePrice(props.price.cents),
      imageUrl: normalizeOptionalText(props.imageUrl, 'Image URL'),
      active: props.active,
      deletedAt: props.deletedAt === null ? null : requireValidDate(props.deletedAt, 'Deleted at'),
      createdAt: requireValidDate(props.createdAt, 'Created at'),
      updatedAt: requireValidDate(props.updatedAt, 'Updated at'),
    });
  }

  get id(): ItemID {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get category(): string {
    return this.props.category;
  }

  get categories(): readonly string[] {
    return this.props.categories;
  }

  get price(): Money {
    return this.props.price;
  }

  get imageUrl(): string | null {
    return this.props.imageUrl;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt === null ? null : new Date(this.props.deletedAt.getTime());
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.props.updatedAt.getTime());
  }

  // Not removed from the catalog. Removed items stay only to explain past orders.
  get isActive(): boolean {
    return this.props.deletedAt === null;
  }

  // The "Active" switch: a disabled item stays editable and listed for administrators.
  get isEnabled(): boolean {
    return this.props.active;
  }

  get isSellable(): boolean {
    return this.isActive && this.isEnabled;
  }

  update(input: UpdateItemInput): void {
    const now = requireValidDate(input.now, 'Now');

    if (!this.isActive) {
      throw new InvariantViolationError('Removed items cannot be edited');
    }

    if (input.name !== undefined) {
      this.props.name = requireNonEmptyString(input.name, 'Name', 160);
    }

    if (input.description !== undefined) {
      this.props.description = normalizeOptionalText(input.description, 'Description');
    }

    if (input.priceCents !== undefined) {
      this.props.price = requireNonNegativePrice(input.priceCents);
    }

    if (input.imageUrl !== undefined) {
      this.props.imageUrl = normalizeOptionalText(input.imageUrl, 'Image URL');
    }

    if (input.categories !== undefined || input.category !== undefined) {
      const legacyCategory =
        input.category === undefined || input.category === DEFAULT_ITEM_CATEGORY
          ? []
          : [input.category];
      this.props.categories = validateCategories(input.categories ?? legacyCategory);
      this.props.category = this.props.categories[0] ?? DEFAULT_ITEM_CATEGORY;
    }

    if (input.active !== undefined) {
      this.props.active = input.active;
    }

    this.props.updatedAt = now;
  }

  remove(now: Date): void {
    if (!this.isActive) {
      throw new InvariantViolationError('Item is already removed');
    }

    const timestamp = requireValidDate(now, 'Now');
    this.props.deletedAt = timestamp;
    this.props.updatedAt = timestamp;
  }
}
