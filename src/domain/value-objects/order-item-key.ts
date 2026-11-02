import { ItemID, OrderID } from '@/domain/value-objects/ids';
import { ValueObject } from '@/domain/value-objects/value-object';

interface OrderItemKeyProps {
  readonly orderId: string;
  readonly itemId: string;
}

/**
 * Composite identity of an order line: one catalog item per order.
 */
export class OrderItemKey extends ValueObject<OrderItemKeyProps> {
  constructor(orderId: OrderID, itemId: ItemID) {
    super(Object.freeze({ orderId: orderId.value, itemId: itemId.value }));
  }

  get orderId(): OrderID {
    return new OrderID(this.props.orderId);
  }

  get itemId(): ItemID {
    return new ItemID(this.props.itemId);
  }

  override equals(other: ValueObject<OrderItemKeyProps> | null | undefined): boolean {
    return (
      other instanceof OrderItemKey &&
      this.props.orderId === other.props.orderId &&
      this.props.itemId === other.props.itemId
    );
  }

  override toString(): string {
    return `${this.props.orderId}:${this.props.itemId}`;
  }

  toJSON(): OrderItemKeyProps {
    return { ...this.props };
  }
}
