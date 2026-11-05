import type { Item } from '@/domain/entity/item';
import type { Order, OrderStatus, OrderType, PaymentMethod } from '@/domain/entity/order';
import type { Role, User } from '@/domain/entity/user';

export interface UserResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ItemResponse {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceCents: number;
  readonly imageUrl: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrderItemResponse {
  readonly itemId: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
}

export interface OrderPaymentResponse {
  readonly method: PaymentMethod;
  readonly amountCents: number;
}

export interface OrderResponse {
  readonly id: string;
  readonly type: OrderType;
  readonly status: OrderStatus;
  readonly tableCode: string | null;
  readonly openedByUserId: string;
  readonly closedByUserId: string | null;
  readonly canceledByUserId: string | null;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly canceledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly totalCents: number;
  readonly items: readonly OrderItemResponse[];
  readonly payments: readonly OrderPaymentResponse[];
}

export interface PageResponse<T> {
  readonly data: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

function toNullableIsoString(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id.value,
    name: user.name,
    email: user.email,
    roles: user.roles,
    isActive: user.isActive,
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
  };
}

export function toItemResponse(item: Item): ItemResponse {
  return {
    id: item.id.value,
    name: item.name,
    description: item.description,
    priceCents: item.price.cents,
    imageUrl: item.imageUrl,
    isActive: item.isActive,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

export function toOrderResponse(order: Order): OrderResponse {
  return {
    id: order.id.value,
    type: order.type,
    status: order.status,
    tableCode: order.tableCode,
    openedByUserId: order.openedByUserId.value,
    closedByUserId: order.closedByUserId?.value ?? null,
    canceledByUserId: order.canceledByUserId?.value ?? null,
    openedAt: toIsoString(order.openedAt),
    closedAt: toNullableIsoString(order.closedAt),
    canceledAt: toNullableIsoString(order.canceledAt),
    createdAt: toIsoString(order.createdAt),
    updatedAt: toIsoString(order.updatedAt),
    version: order.version,
    totalCents: order.total.cents,
    items: order.items.map((item) => ({
      itemId: item.itemId.value,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPriceCents: item.unitPrice.cents,
      lineTotalCents: item.lineTotal.cents,
    })),
    payments: order.payments.map((payment) => ({
      method: payment.method,
      amountCents: payment.amountCents,
    })),
  };
}

export function toPageResponse<T, TResponse>(
  values: readonly T[],
  total: number,
  page: number,
  pageSize: number,
  map: (value: T) => TResponse,
): PageResponse<TResponse> {
  return {
    data: values.map(map),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}
