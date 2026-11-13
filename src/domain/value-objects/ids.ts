import { ID } from '@/domain/value-objects/id';

export class UserID extends ID<'User'> {
  constructor(value: string) {
    super(value);
  }
}

export class RoleID extends ID<'Role'> {
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

export class OrderPaymentID extends ID<'OrderPayment'> {
  constructor(value: string) {
    super(value);
  }
}

export class RefreshTokenID extends ID<'RefreshToken'> {
  constructor(value: string) {
    super(value);
  }
}

export class AuditLogID extends ID<'AuditLog'> {
  constructor(value: string) {
    super(value);
  }
}
