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
import {
  type Adjustment,
  calculatePricing,
  type PricingBreakdown,
  requireAdjustment,
  requireBasisPoints,
} from './pricing';

export type {
  Adjustment,
  AdjustmentMode,
  AdjustmentType,
  PricingBreakdown,
} from './pricing';
export { ADJUSTMENT_MODES, ADJUSTMENT_TYPES, MAX_BASIS_POINTS } from './pricing';

export type OrderType = 'COUNTER' | 'TABLE';
export type OrderStatus = 'OPEN' | 'AWAITING_PAYMENT' | 'CLOSED' | 'CANCELED';
export type PaymentMethod = 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'PIX' | 'OTHER';

export const ORDER_TYPES: readonly OrderType[] = Object.freeze(['COUNTER', 'TABLE']);
export const ORDER_STATUSES: readonly OrderStatus[] = Object.freeze([
  'OPEN',
  'AWAITING_PAYMENT',
  'CLOSED',
  'CANCELED',
]);
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
  // Cash handed over by the customer; the change is derived, never trusted from the client.
  readonly receivedCents?: number | null;
}

export interface OrderPaymentProps {
  readonly method: PaymentMethod;
  readonly amount: Money;
  readonly received: Money | null;
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

    let received: Money | null = null;
    if (input.receivedCents !== undefined && input.receivedCents !== null) {
      if (input.method !== 'CASH') {
        throw new InvalidValueError('Only cash payments can record an amount received');
      }

      received = Money.fromCents(input.receivedCents);
      if (received.cents < amount.cents) {
        throw new InvalidValueError('Amount received cannot be less than the payment amount');
      }
    }

    return new OrderPayment({ method: input.method, amount, received });
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

  get receivedCents(): number | null {
    return this.props.received === null ? null : this.props.received.cents;
  }

  get changeCents(): number | null {
    return this.props.received === null
      ? null
      : this.props.received.cents - this.props.amount.cents;
  }

  toJSON(): {
    method: PaymentMethod;
    amountCents: number;
    receivedCents: number | null;
    changeCents: number | null;
  } {
    return {
      method: this.props.method,
      amountCents: this.props.amount.cents,
      receivedCents: this.receivedCents,
      changeCents: this.changeCents,
    };
  }
}

export interface OrderProps {
  id: OrderID;
  type: OrderType;
  status: OrderStatus;
  tableCode: string | null;
  label: string | null;
  openedByUserId: UserID;
  closedByUserId: UserID | null;
  canceledByUserId: UserID | null;
  paymentRequestedByUserId: UserID | null;
  paymentRequestedAt: Date | null;
  adjustment: Adjustment | null;
  applyServiceFee: boolean;
  // Rate snapshot in basis points; zero when the fee does not apply.
  serviceFeeBasisPoints: number;
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
  readonly label?: string | null;
  readonly adjustment?: Adjustment | null;
  // Present only when the sale charges a service fee.
  readonly serviceFeeBasisPoints?: number;
  readonly now: Date;
}

export interface OpenTableOrderInput {
  readonly id: OrderID;
  readonly openedByUserId: UserID;
  readonly tableCode: string;
  // Current rate from the settings; table orders charge the fee by default.
  readonly serviceFeeBasisPoints?: number;
  readonly now: Date;
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') {
    return null;
  }

  return requireNonEmptyString(value, 'Label', 160);
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
        label: normalizeLabel(input.label),
        openedByUserId: input.openedByUserId,
        closedByUserId: input.openedByUserId,
        canceledByUserId: null,
        paymentRequestedByUserId: null,
        paymentRequestedAt: null,
        adjustment:
          input.adjustment === undefined || input.adjustment === null
            ? null
            : requireAdjustment(input.adjustment),
        applyServiceFee: input.serviceFeeBasisPoints !== undefined,
        serviceFeeBasisPoints:
          input.serviceFeeBasisPoints === undefined
            ? 0
            : requireBasisPoints(input.serviceFeeBasisPoints, 'Service fee'),
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
        label: null,
        openedByUserId: input.openedByUserId,
        closedByUserId: null,
        canceledByUserId: null,
        paymentRequestedByUserId: null,
        paymentRequestedAt: null,
        adjustment: null,
        applyServiceFee: true,
        serviceFeeBasisPoints: requireBasisPoints(input.serviceFeeBasisPoints ?? 0, 'Service fee'),
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
        label: normalizeLabel(props.label),
        adjustment: props.adjustment === null ? null : requireAdjustment(props.adjustment),
        serviceFeeBasisPoints: requireBasisPoints(props.serviceFeeBasisPoints, 'Service fee'),
        paymentRequestedAt:
          props.paymentRequestedAt === null
            ? null
            : requireValidDate(props.paymentRequestedAt, 'Payment requested at'),
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

    if (!order.props.applyServiceFee && order.props.serviceFeeBasisPoints !== 0) {
      throw new InvariantViolationError('A service fee rate requires the fee to apply');
    }

    if (
      order.status === 'AWAITING_PAYMENT' &&
      (order.props.paymentRequestedAt === null || order.props.paymentRequestedByUserId === null)
    ) {
      throw new InvariantViolationError('An order awaiting payment records who requested it');
    }

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

  get label(): string | null {
    return this.props.label;
  }

  get openedByUserId(): UserID {
    return this.props.openedByUserId;
  }

  get paymentRequestedByUserId(): UserID | null {
    return this.props.paymentRequestedByUserId;
  }

  get paymentRequestedAt(): Date | null {
    return this.props.paymentRequestedAt === null
      ? null
      : new Date(this.props.paymentRequestedAt.getTime());
  }

  get adjustment(): Adjustment | null {
    return this.props.adjustment;
  }

  get applyServiceFee(): boolean {
    return this.props.applyServiceFee;
  }

  get serviceFeeBasisPoints(): number {
    return this.props.serviceFeeBasisPoints;
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

  get subtotal(): Money {
    return this.items.reduce((total, item) => total.add(item.lineTotal), Money.zero());
  }

  get pricing(): PricingBreakdown {
    return calculatePricing({
      subtotal: this.subtotal,
      adjustment: this.props.adjustment,
      serviceFeeBasisPoints: this.props.serviceFeeBasisPoints,
    });
  }

  get total(): Money {
    return this.pricing.total;
  }

  getItem(itemId: ItemID): OrderItem | null {
    return this.lineMap.get(new OrderItemKey(this.props.id, itemId).toString()) ?? null;
  }

  addItem(item: Item, quantity: number, now: Date): void {
    this.assertEditableLines();
    this.addOrIncrementLine(item, quantity, now);
    this.touch(now);
  }

  changeItemQuantity(itemId: ItemID, quantity: number, now: Date): void {
    this.assertEditableLines();
    const line = this.getItem(itemId);

    if (line === null) {
      throw new InvariantViolationError('Order item not found');
    }

    line.changeQuantity(quantity, now);
    this.touch(now);
  }

  removeItem(itemId: ItemID, now: Date): void {
    this.assertEditableLines();
    const key = new OrderItemKey(this.props.id, itemId).toString();

    if (!this.lineMap.delete(key)) {
      throw new InvariantViolationError('Order item not found');
    }

    this.touch(now);
  }

  setAdjustment(adjustment: Adjustment | null, now: Date): void {
    this.assertActive();
    this.props.adjustment = adjustment === null ? null : requireAdjustment(adjustment);
    this.touch(now);
  }

  // `basisPoints` is the current rate from the settings; it is snapshotted on the order.
  setServiceFee(apply: boolean, basisPoints: number, now: Date): void {
    this.assertActive();
    this.props.applyServiceFee = apply;
    this.props.serviceFeeBasisPoints = apply ? requireBasisPoints(basisPoints, 'Service fee') : 0;
    this.touch(now);
  }

  /**
   * The server hands a table over to the cashier. The lines are locked until it is reopened.
   */
  requestPayment(byUserId: UserID, now: Date): void {
    if (this.props.type !== 'TABLE') {
      throw new InvalidStateTransitionError('Only table orders can wait for payment');
    }
    if (this.props.status !== 'OPEN') {
      throw new InvalidStateTransitionError(
        `Order is ${this.props.status} and cannot request payment`,
      );
    }
    if (this.lineMap.size === 0) {
      throw new InvariantViolationError('An order without items cannot request payment');
    }

    const timestamp = requireValidDate(now, 'Now');
    this.props.status = 'AWAITING_PAYMENT';
    this.props.paymentRequestedByUserId = byUserId;
    this.props.paymentRequestedAt = timestamp;
    this.touch(timestamp);
  }

  reopen(now: Date): void {
    if (this.props.status !== 'AWAITING_PAYMENT') {
      throw new InvalidStateTransitionError(`Order is ${this.props.status} and cannot be reopened`);
    }

    this.props.status = 'OPEN';
    this.props.paymentRequestedByUserId = null;
    this.props.paymentRequestedAt = null;
    this.touch(now);
  }

  close(byUserId: UserID, payments: readonly OrderPaymentInput[], now: Date): void {
    this.assertActive();
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
    this.assertActive();
    const timestamp = requireValidDate(now, 'Now');

    this.props.status = 'CANCELED';
    this.props.canceledByUserId = byUserId;
    this.props.canceledAt = timestamp;
    this.touch(timestamp);
  }

  private addOrIncrementLine(item: Item, quantity: number, now: Date): void {
    if (!item.isSellable) {
      throw new InvariantViolationError('Only sellable items can be added to an order');
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

  // Lines can change only while the server is still taking the order.
  private assertEditableLines(): void {
    if (this.props.status !== 'OPEN') {
      throw new InvalidStateTransitionError(`Order is ${this.props.status} and cannot be changed`);
    }
  }

  // Open and awaiting payment are the live states; closed and canceled are terminal.
  private assertActive(): void {
    if (this.props.status !== 'OPEN' && this.props.status !== 'AWAITING_PAYMENT') {
      throw new InvalidStateTransitionError(`Order is ${this.props.status} and cannot be changed`);
    }
  }

  private touch(now: Date): void {
    this.props.updatedAt = requireValidDate(now, 'Now');
    this.props.version += 1;
  }
}
