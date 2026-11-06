import type { PaymentMethod } from '@/domain/entity/order';

export interface SalesRange {
  // Inclusive.
  readonly from: Date;
  // Exclusive.
  readonly to: Date;
}

export interface MethodTotal {
  readonly method: PaymentMethod;
  readonly amountCents: number;
}

export interface SalesSummary {
  // Orders closed within the range.
  readonly closedOrders: number;
  readonly revenueCents: number;
  readonly canceledOrders: number;
  // Payments of the closed orders, by method.
  readonly byMethod: readonly MethodTotal[];
  // Orders still being served right now, whatever the range.
  readonly openOrders: number;
}

export interface ReportRepository {
  salesSummary(range: SalesRange): Promise<SalesSummary>;
}
