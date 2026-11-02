import { ID } from '@/domain/value-objects/id';

export class UserID extends ID<'User'> {
  constructor(value: string) {
    super(value);
  }
}

export class ItemID extends ID<'Item'> {
  constructor(value: string) {
    super(value);
  }
}

export class OrderID extends ID<'Order'> {
  constructor(value: string) {
    super(value);
  }
}
