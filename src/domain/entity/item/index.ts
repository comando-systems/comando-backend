import { requireNonEmptyString, requireValidDate } from '@/domain/entity/validation';
import { InvalidValueError, InvariantViolationError } from '@/domain/errors';
import type { ItemID } from '@/domain/value-objects/ids';
import { Money } from '@/domain/value-objects/money';

export interface ItemProps {
  id: ItemID;
  name: string;
  description: string | null;
  price: Money;
  imageUrl: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateItemInput {
  readonly id: ItemID;
  readonly name: string;
  readonly description?: string | null;
  readonly priceCents: number;
  readonly imageUrl?: string | null;
  readonly now: Date;
}

export interface UpdateItemInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly priceCents?: number;
  readonly imageUrl?: string | null;
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

    return new Item({
      id: input.id,
      name: requireNonEmptyString(input.name, 'Name', 160),
      description: normalizeOptionalText(input.description, 'Description'),
      price: requireNonNegativePrice(input.priceCents),
      imageUrl: normalizeOptionalText(input.imageUrl, 'Image URL'),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: ItemProps): Item {
    return new Item({
      id: props.id,
      name: requireNonEmptyString(props.name, 'Name', 160),
      description: normalizeOptionalText(props.description, 'Description'),
      price: requireNonNegativePrice(props.price.cents),
      imageUrl: normalizeOptionalText(props.imageUrl, 'Image URL'),
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

  get isActive(): boolean {
    return this.props.deletedAt === null;
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
