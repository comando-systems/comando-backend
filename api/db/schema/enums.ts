import { pgEnum } from "drizzle-orm/pg-core";

export const sessionTypeEnum = pgEnum("session_type", ["COUNTER", "TABLE"]);
export const sessionStatusEnum = pgEnum("session_status", [
  "OPEN",
  "CLOSED",
  "CANCELLED",
]);
export const sessionItemStatusEnum = pgEnum("session_item_status", [
  "ACTIVE",
  "REMOVED",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "PIX",
  "OTHER",
]);
