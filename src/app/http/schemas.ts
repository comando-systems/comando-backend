import { z } from 'zod';

const positiveId = z.string().regex(/^[1-9]\d*$/, 'Must be a positive integer identifier');

export const loginBodySchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').max(512),
});

const roleSchema = z.enum(['ADMIN', 'CASHIER', 'SERVER']);

const passwordSchema = z
  .string()
  .min(8, 'Password must have at least 8 characters')
  .max(128, 'Password must have at most 128 characters');

export const createUserBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required'),
  password: passwordSchema,
  roles: z.array(roleSchema).min(1, 'At least one role is required'),
});

export const updateUserBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: passwordSchema.optional(),
    roles: z.array(roleSchema).min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const createItemBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().nullable().optional(),
  category: z.string().trim().min(1, 'Category cannot be empty').max(80).optional(),
  enabled: z.boolean().optional(),
  priceCents: z.number().int().min(0, 'Price cannot be negative'),
  imageUrl: z.string().nullable().optional(),
});

export const updateItemBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    category: z.string().trim().min(1, 'Category cannot be empty').max(80).optional(),
    enabled: z.boolean().optional(),
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
  // Cash handed over; the server derives the change.
  receivedCents: z.number().int().positive('Amount received must be positive').optional(),
});

// Both amounts are integer cents and independent: an order may have one, both, or neither.
const orderAmountSchema = z.number().int().min(0, 'Amount cannot be negative');

export const createCounterOrderBodySchema = z.object({
  items: z.array(orderLineSchema).min(1, 'At least one item is required'),
  payments: z.array(paymentSchema).default([]),
  label: z.string().max(160).nullable().optional(),
  surchargeCents: orderAmountSchema.optional(),
  discountCents: orderAmountSchema.optional(),
  applyServiceFee: z.boolean().optional(),
});

export const setOrderPricingBodySchema = z
  .object({
    // `null` clears the amount to zero.
    surchargeCents: orderAmountSchema.nullable().optional(),
    discountCents: orderAmountSchema.nullable().optional(),
    applyServiceFee: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.surchargeCents !== undefined ||
      value.discountCents !== undefined ||
      value.applyServiceFee !== undefined,
    {
      message: 'Provide a surcharge, a discount, or applyServiceFee',
    },
  );

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

export const updateSettingsBodySchema = z
  .object({
    serviceFeeEnabled: z.boolean().optional(),
    // 10% is 1000.
    serviceFeeBasisPoints: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
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

const orderStatusSchema = z.enum(['OPEN', 'AWAITING_PAYMENT', 'CLOSED', 'CANCELED']);

export const orderListQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
  // Comma-separated, such as `OPEN,AWAITING_PAYMENT` for the orders still being served.
  statuses: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : value
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
    )
    .pipe(z.array(orderStatusSchema).min(1).optional()),
  tableCode: z.string().min(1).max(64).optional(),
  type: z.enum(['COUNTER', 'TABLE']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const salesSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
