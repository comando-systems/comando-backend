import { z } from 'zod';

const positiveId = z.string().regex(/^[1-9]\d*$/, 'Must be a positive integer identifier');

export const loginBodySchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

const roleSchema = z.enum(['ADMIN', 'CASHIER', 'SERVER']);

export const createUserBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
  roles: z.array(roleSchema).min(1, 'At least one role is required'),
});

export const updateUserBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    roles: z.array(roleSchema).min(1).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const createItemBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().nullable().optional(),
  priceCents: z.number().int().min(0, 'Price cannot be negative'),
  imageUrl: z.string().nullable().optional(),
});

export const updateItemBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    priceCents: z.number().int().min(0, 'Price cannot be negative').optional(),
    imageUrl: z.string().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

const orderLineSchema = z.object({
  itemId: positiveId,
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

const paymentMethodSchema = z.enum(['CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'PIX', 'OTHER']);

const paymentSchema = z.object({
  method: paymentMethodSchema,
  amountCents: z.number().int().positive('Payment amount must be positive'),
});

export const createCounterOrderBodySchema = z.object({
  items: z.array(orderLineSchema).min(1, 'At least one item is required'),
  payments: z.array(paymentSchema).default([]),
});

export const openTableOrderBodySchema = z.object({
  tableCode: z.string().min(1, 'Table code is required'),
});

export const addOrderItemsBodySchema = z.object({
  items: z.array(orderLineSchema).min(1, 'At least one item is required'),
});

export const changeOrderItemQuantityBodySchema = z.object({
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export const closeOrderBodySchema = z.object({
  payments: z.array(paymentSchema).default([]),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const userListQuerySchema = paginationQuerySchema;

export const itemListQuerySchema = paginationQuerySchema.extend({
  includeRemoved: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const orderListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['OPEN', 'CLOSED', 'CANCELED']).optional(),
  type: z.enum(['COUNTER', 'TABLE']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
