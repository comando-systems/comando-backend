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
  priceCents: cents,
  imageUrl: z.string().nullable(),
  isActive: z.boolean().describe('False once the item was removed from the active catalog.'),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const orderItemResponseSchema = z.object({
  itemId: identifier,
  itemName: z.string().describe('Name of the item when it was ordered.'),
  quantity: z.number().int(),
  unitPriceCents: cents.describe(
    'Unit price when it was ordered; later catalog changes do not alter it.',
  ),
  lineTotalCents: cents,
});

export const orderPaymentResponseSchema = z.object({
  method: paymentMethodSchema,
  amountCents: cents,
});

export const orderResponseSchema = z.object({
  id: identifier,
  type: z.enum(['COUNTER', 'TABLE']),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELED']),
  tableCode: z.string().nullable(),
  openedByUserId: identifier,
  closedByUserId: identifier.nullable(),
  canceledByUserId: identifier.nullable(),
  openedAt: timestamp,
  closedAt: timestamp.nullable(),
  canceledAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  version: z.number().int().describe('Increments on every change to the order.'),
  totalCents: cents.describe('Calculated by the server from the line snapshots.'),
  items: z.array(orderItemResponseSchema),
  payments: z.array(orderPaymentResponseSchema),
});

export const loginResponseSchema = z.object({
  accessToken: z.string().describe('JWT to send as `Authorization: Bearer <token>`.'),
  expiresAt: timestamp,
  user: userResponseSchema,
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
