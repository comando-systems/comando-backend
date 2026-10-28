import {
  bigint,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { paymentMethodEnum } from "./enums";
import { serviceSessions } from "./sessions";
import { users } from "./users";

export const payments = pgTable("payments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: bigint("session_id", { mode: "number" })
    .notNull()
    .references(() => serviceSessions.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  method: paymentMethodEnum("method").notNull(),
  receivedBy: bigint("received_by", { mode: "number" })
    .notNull()
    .references(() => users.id),
  paidAt: timestamp("paid_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  notes: text("notes"),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  session: one(serviceSessions, {
    fields: [payments.sessionId],
    references: [serviceSessions.id],
  }),
  receivedByUser: one(users, {
    fields: [payments.receivedBy],
    references: [users.id],
    relationName: "receivedPayments",
  }),
}));

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
