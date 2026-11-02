import type { Item } from '@/domain/entity/item';
import {
  requireNonEmptyString,
  requirePositiveInteger,
  requireValidDate,
} from '@/domain/entity/validation';
import {
  InvalidStateTransitionError,
  InvalidValueError,
  InvariantViolationError,
} from '@/domain/errors';
import type { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';
import { Money } from '@/domain/value-objects/money';
import { OrderItemKey } from '@/domain/value-objects/order-item-key';

export type OrderType = 'COUNTER' | 'TABLE';
export type OrderStatus = 'OPEN' | 'CLOSED' | 'CANCELED';

export const ORDER_TYPES: readonly OrderType[] = Object.freeze(['COUNTER', 'TABLE']);
export const ORDER_STATUSES: readonly OrderStatus[] = Object.freeze(['OPEN', 'CLOSED', 'CANCELED']);

export interface OrderItemProps {
  key: OrderItemKey;
  itemName: string;
  quantity: number;
  unitPrice: Money;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderItemInput {
  readonly key: OrderItemKey;
  readonly itemName: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly now: Date;
}

export class OrderItem {
  private constructor(private readonly props: OrderItemProps) {}

  static create(input: CreateOrderItemInput): OrderItem {
    const now = requireValidDate(input.now, 'Now');
    const unitPrice = Money.fromCents(input.unitPrice.cents);

    if (unitPrice.isNegative()) {
      throw new InvalidValueError('Unit price cannot be negative');
    }

    return new OrderItem({
      key: input.key,
      itemName: requireNonEmptyString(input.itemName, 'Item name', 160),
      quantity: requirePositiveInteger(input.quantity, 'Quantity'),
      unitPrice,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: OrderItemProps): OrderItem {
    return new OrderItem({
      key: props.key,
      itemName: requireNonEmptyString(props.itemName, 'Item name', 160),
      quantity: requirePositiveInteger(props.quantity, 'Quantity'),
      unitPrice: Money.fromCents(props.unitPrice.cents),
      createdAt: requireValidDate(props.createdAt, 'Created at'),
      updatedAt: requireValidDate(props.updatedAt, 'Updated at'),
    });
  }

  get key(): OrderItemKey {
    return this.props.key;
  }

  get itemId(): ItemID {
    return this.props.key.itemId;
  }

  get itemName(): string {
    return this.props.itemName;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get lineTotal(): Money {
    return this.props.unitPrice.multiply(this.props.quantity);
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.props.updatedAt.getTime());
  }

  changeQuantity(quantity: number, now: Date): void {
    this.props.quantity = requirePositiveInteger(quantity, 'Quantity');
    this.props.updatedAt = requireValidDate(now, 'Now');
  }
}

export interface OrderProps {
  id: OrderID;
  type: OrderType;
  status: OrderStatus;
  tableCode: string | null;
  openedByUserId: UserID;
  closedByUserId: UserID | null;
  canceledByUserId: UserID | null;
  openedAt: Date;
  closedAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface CounterOrderLine {
  readonly item: Item;
  readonly quantity: number;
}

export interface CreateCounterOrderInput {
  readonly id: OrderID;
  readonly openedByUserId: UserID;
  readonly lines: readonly CounterOrderLine[];
  readonly now: Date;
}

export interface OpenTableOrderInput {
  readonly id: OrderID;
  readonly openedByUserId: UserID;
  readonly tableCode: string;
  readonly now: Date;
}

export class Order {
  private constructor(
    private readonly props: OrderProps,
    private readonly lineMap: Map<string, OrderItem>,
  ) {}

  static createCounter(input: CreateCounterOrderInput): Order {
    if (input.lines.length === 0) {
      throw new InvalidValueError('A counter order requires at least one item');
    }

    const now = requireValidDate(input.now, 'Now');
    const order = new Order(
      {
        id: input.id,
        type: 'COUNTER',
        status: 'CLOSED',
        tableCode: null,
        openedByUserId: input.openedByUserId,
        closedByUserId: input.openedByUserId,
        canceledByUserId: null,
        openedAt: now,
        closedAt: now,
        canceledAt: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      new Map(),
    );

    for (const line of input.lines) {
      order.addOrIncrementLine(line.item, line.quantity, now);
    }

    return order;
  }

  static openTable(input: OpenTableOrderInput): Order {
    const now = requireValidDate(input.now, 'Now');

    return new Order(
      {
        id: input.id,
        type: 'TABLE',
        status: 'OPEN',
        tableCode: requireNonEmptyString(input.tableCode, 'Table code', 64),
        openedByUserId: input.openedByUserId,
        closedByUserId: null,
        canceledByUserId: null,
        openedAt: now,
        closedAt: null,
        canceledAt: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
      new Map(),
    );
  }

  static restore(props: OrderProps, items: readonly OrderItem[]): Order {
    const lineMap = new Map<string, OrderItem>();

    for (const item of items) {
      if (!item.key.orderId.equals(props.id)) {
        throw new InvariantViolationError('Order item does not belong to this order');
      }
      lineMap.set(item.key.toString(), item);
    }

    return new Order(
      {
        ...props,
        openedAt: requireValidDate(props.openedAt, 'Opened at'),
        closedAt: props.closedAt === null ? null : requireValidDate(props.closedAt, 'Closed at'),
        canceledAt:
          props.canceledAt === null ? null : requireValidDate(props.canceledAt, 'Canceled at'),
        createdAt: requireValidDate(props.createdAt, 'Created at'),
        updatedAt: requireValidDate(props.updatedAt, 'Updated at'),
        version: requirePositiveInteger(props.version, 'Version'),
      },
      lineMap,
    );
  }

  get id(): OrderID {
    return this.props.id;
  }

  get type(): OrderType {
    return this.props.type;
  }

  get status(): OrderStatus {
    return this.props.status;
  }

  get tableCode(): string | null {
    return this.props.tableCode;
  }

  get openedByUserId(): UserID {
    return this.props.openedByUserId;
  }

  get closedByUserId(): UserID | null {
    return this.props.closedByUserId;
  }

  get canceledByUserId(): UserID | null {
    return this.props.canceledByUserId;
  }

  get openedAt(): Date {
    return new Date(this.props.openedAt.getTime());
  }

  get closedAt(): Date | null {
    return this.props.closedAt === null ? null : new Date(this.props.closedAt.getTime());
  }

  get canceledAt(): Date | null {
    return this.props.canceledAt === null ? null : new Date(this.props.canceledAt.getTime());
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.props.updatedAt.getTime());
  }

  get version(): number {
    return this.props.version;
  }

  get items(): readonly OrderItem[] {
    return [...this.lineMap.values()];
  }

  get total(): Money {
    return this.items.reduce((total, item) => total.add(item.lineTotal), Money.zero());
  }

  getItem(itemId: ItemID): OrderItem | null {
    return this.lineMap.get(new OrderItemKey(this.props.id, itemId).toString()) ?? null;
  }

  addItem(item: Item, quantity: number, now: Date): void {
    this.assertOpen();
    this.addOrIncrementLine(item, quantity, now);
    this.touch(now);
  }

  changeItemQuantity(itemId: ItemID, quantity: number, now: Date): void {
    this.assertOpen();
    const line = this.getItem(itemId);

    if (line === null) {
      throw new InvariantViolationError('Order item not found');
    }

    line.changeQuantity(quantity, now);
    this.touch(now);
  }

  close(byUserId: UserID, now: Date): void {
    this.assertOpen();
    const timestamp = requireValidDate(now, 'Now');

    this.props.status = 'CLOSED';
    this.props.closedByUserId = byUserId;
    this.props.closedAt = timestamp;
    this.touch(timestamp);
  }

  cancel(byUserId: UserID, now: Date): void {
    this.assertOpen();
    const timestamp = requireValidDate(now, 'Now');

    this.props.status = 'CANCELED';
    this.props.canceledByUserId = byUserId;
    this.props.canceledAt = timestamp;
    this.touch(timestamp);
  }

  private addOrIncrementLine(item: Item, quantity: number, now: Date): void {
    if (!item.isActive) {
      throw new InvariantViolationError('Removed items cannot be added to an order');
    }

    const normalizedQuantity = requirePositiveInteger(quantity, 'Quantity');
    const key = new OrderItemKey(this.props.id, item.id);
    const existing = this.lineMap.get(key.toString());

    if (existing !== undefined) {
      const nextQuantity = existing.quantity + normalizedQuantity;
      if (!Number.isSafeInteger(nextQuantity)) {
        throw new InvalidValueError('Quantity overflow');
      }
      existing.changeQuantity(nextQuantity, now);
      return;
    }

    this.lineMap.set(
      key.toString(),
      OrderItem.create({
        key,
        itemName: item.name,
        quantity: normalizedQuantity,
        unitPrice: item.price,
        now,
      }),
    );
  }

  private assertOpen(): void {
    if (this.props.status !== 'OPEN') {
      throw new InvalidStateTransitionError(`Order is ${this.props.status} and cannot be changed`);
    }
  }

  private touch(now: Date): void {
    this.props.updatedAt = requireValidDate(now, 'Now');
    this.props.version += 1;
  }
}
