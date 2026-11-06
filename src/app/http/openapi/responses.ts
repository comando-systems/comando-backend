import { z } from 'zod';

const identifier = z
  .string()
  .regex(/^[1-9]\d*$/)
  .describe('Decimal identifier.');
const timestamp = z.string().describe('ISO 8601 timestamp in UTC.');
const cents = z.number().int().describe('Amount in integer cents.');

const roleSchema = z.enum(['ADMIN', 'CASHIER', 'SERVER']);
const paymentMethodSchema = z.enum(['CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'PIX', 'OTHER']);

export const userResponseSchema = z.object({
  id: identifier,
  name: z.string(),
  email: z.string(),
  roles: z.array(roleSchema),
  isActive: z.boolean().describe('False once the user was deactivated.'),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const itemResponseSchema = z.object({
  id: identifier,
  name: z.string(),
  description: z.string().nullable(),
  category: z.string().describe('Groups the catalog on the sales screen.'),
  priceCents: cents,
  imageUrl: z.string().nullable(),
  enabled: z
    .boolean()
    .describe('The "Active" switch: a disabled item stays editable but cannot be sold.'),
  isActive: z.boolean().describe('False once the item was removed from the active catalog.'),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const orderItemResponseSchema = z.object({
  itemId: identifier,
  itemName: z.string().describe('Name of the item when it was ordered.'),
  quantity: z.number().int(),
  unitPriceCents: cents.describe(
    'Unit price when it was ordered; later catalog changes do not alter it.',
  ),
  lineTotalCents: cents,
});

const orderPaymentResponseSchema = z.object({
  method: paymentMethodSchema,
  amountCents: cents,
  receivedCents: cents.nullable().describe('Cash handed over; only for CASH payments.'),
  changeCents: cents.nullable().describe('Derived by the server: received minus the amount.'),
});

const orderAdjustmentResponseSchema = z.object({
  type: z.enum(['DISCOUNT', 'SURCHARGE']),
  mode: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().describe('Basis points for PERCENT (1000 is 10%), cents for FIXED.'),
});

export const orderResponseSchema = z.object({
  id: identifier,
  type: z.enum(['COUNTER', 'TABLE']),
  status: z.enum(['OPEN', 'AWAITING_PAYMENT', 'CLOSED', 'CANCELED']),
  tableCode: z.string().nullable(),
  label: z.string().nullable().describe('Customer name of a counter sale.'),
  openedByUserId: identifier,
  closedByUserId: identifier.nullable(),
  canceledByUserId: identifier.nullable(),
  paymentRequestedByUserId: identifier.nullable(),
  paymentRequestedAt: timestamp.nullable(),
  openedAt: timestamp,
  closedAt: timestamp.nullable(),
  canceledAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  version: z.number().int().describe('Increments on every change to the order.'),
  adjustment: orderAdjustmentResponseSchema.nullable(),
  applyServiceFee: z.boolean(),
  serviceFeeBasisPoints: z
    .number()
    .int()
    .describe('Rate snapshot taken for this order; 1000 is 10%.'),
  subtotalCents: cents.describe('Sum of the lines.'),
  adjustmentCents: cents.describe('Signed: negative for a discount.'),
  serviceFeeCents: cents,
  totalCents: cents.describe('Calculated by the server: subtotal, adjustment, then service fee.'),
  items: z.array(orderItemResponseSchema),
  payments: z.array(orderPaymentResponseSchema),
});

export const loginResponseSchema = z.object({
  accessToken: z.string().describe('JWT to send as `Authorization: Bearer <token>`.'),
  expiresAt: timestamp,
  refreshToken: z
    .string()
    .describe('Opaque token for `POST /auth/refresh`. Single use: each refresh returns a new one.'),
  refreshExpiresAt: timestamp,
  user: userResponseSchema,
});

export const settingsResponseSchema = z.object({
  serviceFeeEnabled: z.boolean(),
  serviceFeeBasisPoints: z.number().int().describe('10% is 1000.'),
  updatedAt: timestamp,
});

export const salesSummaryResponseSchema = z.object({
  from: timestamp.describe('Start of the range, inclusive.'),
  to: timestamp.describe('End of the range, exclusive.'),
  closedOrders: z.number().int().describe('Orders closed within the range.'),
  revenueCents: cents.describe('Sum of the totals of the closed orders.'),
  averageTicketCents: cents.describe('Revenue divided by closed orders; zero when there are none.'),
  canceledOrders: z.number().int().describe('Orders canceled within the range.'),
  openOrders: z.number().int().describe('Orders being served right now, whatever the range.'),
  byMethod: z
    .array(z.object({ method: paymentMethodSchema, amountCents: cents }))
    .describe('Payments of the closed orders, by method.'),
});

export const healthResponseSchema = z.object({ status: z.literal('ok') });

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().describe('Stable, machine-readable code such as `VALIDATION_ERROR`.'),
    message: z.string(),
    details: z.unknown().optional().describe('Field-level details for validation errors.'),
    requestId: z.string().optional().describe('Also sent in the `X-Request-Id` header.'),
  }),
});

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    pagination: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
      totalPages: z.number().int(),
    }),
  });
}
