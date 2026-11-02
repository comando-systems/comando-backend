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
export type PaymentMethod = 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'PIX' | 'OTHER';

export const ORDER_TYPES: readonly OrderType[] = Object.freeze(['COUNTER', 'TABLE']);
export const ORDER_STATUSES: readonly OrderStatus[] = Object.freeze(['OPEN', 'CLOSED', 'CANCELED']);
export const PAYMENT_METHODS: readonly PaymentMethod[] = Object.freeze([
  'CASH',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'PIX',
  'OTHER',
]);

export function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

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

export interface OrderPaymentInput {
  readonly method: PaymentMethod;
  readonly amountCents: number;
}

export interface OrderPaymentProps {
  readonly method: PaymentMethod;
  readonly amount: Money;
}

/**
 * A single payment applied to a closed order. Split payments are represented by
 * multiple entries; amounts must be positive and sum to the order total.
 */
export class OrderPayment {
  private constructor(private readonly props: OrderPaymentProps) {}

  static create(input: OrderPaymentInput): OrderPayment {
    if (!isPaymentMethod(input.method)) {
      throw new InvalidValueError('Invalid payment method');
    }

    const amount = Money.fromCents(input.amountCents);

    if (amount.isZero() || amount.isNegative()) {
      throw new InvalidValueError('Payment amount must be positive');
    }

    return new OrderPayment({ method: input.method, amount });
  }

  get method(): PaymentMethod {
    return this.props.method;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get amountCents(): number {
    return this.props.amount.cents;
  }

  toJSON(): { method: PaymentMethod; amountCents: number } {
    return { method: this.props.method, amountCents: this.props.amount.cents };
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

function normalizePayments(inputs: readonly OrderPaymentInput[]): readonly OrderPayment[] {
  return Object.freeze(inputs.map((input) => OrderPayment.create(input)));
}

function assertPaymentsMatchTotal(payments: readonly OrderPayment[], total: Money): void {
  const paid = payments.reduce((sum, payment) => sum.add(payment.amount), Money.zero());

  if (!paid.equals(total)) {
    throw new InvariantViolationError('Payments must sum to the order total');
  }
}

export interface CounterOrderLine {
  readonly item: Item;
  readonly quantity: number;
}

export interface CreateCounterOrderInput {
  readonly id: OrderID;
  readonly openedByUserId: UserID;
  readonly lines: readonly CounterOrderLine[];
  readonly payments: readonly OrderPaymentInput[];
  readonly now: Date;
}

export interface OpenTableOrderInput {
  readonly id: OrderID;
  readonly openedByUserId: UserID;
  readonly tableCode: string;
  readonly now: Date;
}

export class Order {
  private paymentList: readonly OrderPayment[];

  private constructor(
    private readonly props: OrderProps,
    private readonly lineMap: Map<string, OrderItem>,
    payments: readonly OrderPayment[] = [],
  ) {
    this.paymentList = payments;
  }

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

    order.paymentList = normalizePayments(input.payments);
    assertPaymentsMatchTotal(order.paymentList, order.total);

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

  static restore(
    props: OrderProps,
    items: readonly OrderItem[],
    payments: readonly OrderPayment[] = [],
  ): Order {
    const lineMap = new Map<string, OrderItem>();

    for (const item of items) {
      if (!item.key.orderId.equals(props.id)) {
        throw new InvariantViolationError('Order item does not belong to this order');
      }
      lineMap.set(item.key.toString(), item);
    }

    const order = new Order(
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
      payments,
    );

    if (order.status === 'CLOSED') {
      assertPaymentsMatchTotal(order.paymentList, order.total);
    } else if (order.paymentList.length > 0) {
      throw new InvariantViolationError('Only closed orders can have payments');
    }

    return order;
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

  get payments(): readonly OrderPayment[] {
    return this.paymentList;
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

  close(byUserId: UserID, payments: readonly OrderPaymentInput[], now: Date): void {
    this.assertOpen();
    const timestamp = requireValidDate(now, 'Now');
    const normalizedPayments = normalizePayments(payments);

    assertPaymentsMatchTotal(normalizedPayments, this.total);

    this.paymentList = normalizedPayments;
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
