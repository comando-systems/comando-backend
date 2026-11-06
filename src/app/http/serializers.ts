import type { Item } from '@/domain/entity/item';

import type {
  AdjustmentMode,
  AdjustmentType,
  Order,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from '@/domain/entity/order';
import type { Settings } from '@/domain/entity/settings';

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
  readonly category: string;
  readonly priceCents: number;
  readonly imageUrl: string | null;
  // The "Active" switch: a disabled item stays editable but cannot be sold.
  readonly enabled: boolean;
  // False once the item was removed from the catalog.
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
  readonly receivedCents: number | null;
  readonly changeCents: number | null;
}

export interface OrderAdjustmentResponse {
  readonly type: AdjustmentType;
  readonly mode: AdjustmentMode;
  readonly value: number;
}

export interface OrderResponse {
  readonly id: string;
  readonly type: OrderType;
  readonly status: OrderStatus;
  readonly tableCode: string | null;
  readonly label: string | null;
  readonly openedByUserId: string;
  readonly closedByUserId: string | null;
  readonly canceledByUserId: string | null;
  readonly paymentRequestedByUserId: string | null;
  readonly paymentRequestedAt: string | null;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly canceledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly adjustment: OrderAdjustmentResponse | null;
  readonly applyServiceFee: boolean;
  readonly serviceFeeBasisPoints: number;
  readonly subtotalCents: number;
  readonly adjustmentCents: number;
  readonly serviceFeeCents: number;
  readonly totalCents: number;
  readonly items: readonly OrderItemResponse[];
  readonly payments: readonly OrderPaymentResponse[];
}

export interface SalesSummaryResponse {
  readonly from: string;
  readonly to: string;
  readonly closedOrders: number;
  readonly revenueCents: number;
  readonly averageTicketCents: number;
  readonly canceledOrders: number;
  readonly openOrders: number;
  readonly byMethod: ReadonlyArray<{
    readonly method: PaymentMethod;
    readonly amountCents: number;
  }>;
}

export interface SettingsResponse {
  readonly serviceFeeEnabled: boolean;
  // 10% is 1000.
  readonly serviceFeeBasisPoints: number;
  readonly updatedAt: string;
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
    category: item.category,
    priceCents: item.price.cents,
    imageUrl: item.imageUrl,
    enabled: item.isEnabled,
    isActive: item.isActive,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}

export function toOrderResponse(order: Order): OrderResponse {
  const pricing = order.pricing;

  return {
    id: order.id.value,
    type: order.type,
    status: order.status,
    tableCode: order.tableCode,
    label: order.label,
    openedByUserId: order.openedByUserId.value,
    closedByUserId: order.closedByUserId?.value ?? null,
    canceledByUserId: order.canceledByUserId?.value ?? null,
    paymentRequestedByUserId: order.paymentRequestedByUserId?.value ?? null,
    paymentRequestedAt: toNullableIsoString(order.paymentRequestedAt),
    openedAt: toIsoString(order.openedAt),
    closedAt: toNullableIsoString(order.closedAt),
    canceledAt: toNullableIsoString(order.canceledAt),
    createdAt: toIsoString(order.createdAt),
    updatedAt: toIsoString(order.updatedAt),
    version: order.version,
    adjustment: order.adjustment === null ? null : { ...order.adjustment },
    applyServiceFee: order.applyServiceFee,
    serviceFeeBasisPoints: order.serviceFeeBasisPoints,
    subtotalCents: pricing.subtotal.cents,
    adjustmentCents: pricing.adjustment.cents,
    serviceFeeCents: pricing.serviceFee.cents,
    totalCents: pricing.total.cents,
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
      receivedCents: payment.receivedCents,
      changeCents: payment.changeCents,
    })),
  };
}

export function toSalesSummaryResponse(summary: {
  readonly from: Date;
  readonly to: Date;
  readonly closedOrders: number;
  readonly revenueCents: number;
  readonly averageTicketCents: number;
  readonly canceledOrders: number;
  readonly openOrders: number;
  readonly byMethod: ReadonlyArray<{
    readonly method: PaymentMethod;
    readonly amountCents: number;
  }>;
}): SalesSummaryResponse {
  return {
    from: toIsoString(summary.from),
    to: toIsoString(summary.to),
    closedOrders: summary.closedOrders,
    revenueCents: summary.revenueCents,
    averageTicketCents: summary.averageTicketCents,
    canceledOrders: summary.canceledOrders,
    openOrders: summary.openOrders,
    byMethod: summary.byMethod.map(({ method, amountCents }) => ({ method, amountCents })),
  };
}

export function toSettingsResponse(settings: Settings): SettingsResponse {
  return {
    serviceFeeEnabled: settings.serviceFeeEnabled,
    serviceFeeBasisPoints: settings.serviceFeeBasisPoints,
    updatedAt: toIsoString(settings.updatedAt),
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
