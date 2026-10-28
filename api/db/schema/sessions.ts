import {
  bigint,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {
  sessionItemStatusEnum,
  sessionStatusEnum,
  sessionTypeEnum,
} from "./enums";
import { users } from "./users";
import { products } from "./products";

export const serviceSessions = pgTable("service_sessions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  type: sessionTypeEnum("type").notNull(),
  status: sessionStatusEnum("status").notNull().default("OPEN"),
  tableNumber: integer("table_number"),
  openedBy: bigint("opened_by", { mode: "number" })
    .notNull()
    .references(() => users.id),
  closedBy: bigint("closed_by", { mode: "number" }).references(() => users.id),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  notes: text("notes"),
});

export const sessionItems = pgTable("session_items", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: bigint("session_id", { mode: "number" })
    .notNull()
    .references(() => serviceSessions.id),
  productId: bigint("product_id", { mode: "number" })
    .notNull()
    .references(() => products.id),
  quantity: numeric("quantity", { precision: 10, scale: 3 })
    .notNull()
    .default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  status: sessionItemStatusEnum("status").notNull().default("ACTIVE"),
  addedBy: bigint("added_by", { mode: "number" })
    .notNull()
    .references(() => users.id),
  addedAt: timestamp("added_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  removedBy: bigint("removed_by", { mode: "number" }).references(
    () => users.id,
  ),
});

export const serviceSessionsRelations = relations(
  serviceSessions,
  ({ one, many }) => ({
    openedByUser: one(users, {
      fields: [serviceSessions.openedBy],
      references: [users.id],
      relationName: "openedSessions",
    }),
    closedByUser: one(users, {
      fields: [serviceSessions.closedBy],
      references: [users.id],
      relationName: "closedSessions",
    }),
    items: many(sessionItems),
  }),
);

export const sessionItemsRelations = relations(sessionItems, ({ one }) => ({
  session: one(serviceSessions, {
    fields: [sessionItems.sessionId],
    references: [serviceSessions.id],
  }),
  product: one(products, {
    fields: [sessionItems.productId],
    references: [products.id],
  }),
  addedByUser: one(users, {
    fields: [sessionItems.addedBy],
    references: [users.id],
    relationName: "addedItems",
  }),
  removedByUser: one(users, {
    fields: [sessionItems.removedBy],
    references: [users.id],
    relationName: "removedItems",
  }),
}));

export type ServiceSession = typeof serviceSessions.$inferSelect;
export type NewServiceSession = typeof serviceSessions.$inferInsert;
export type SessionItem = typeof sessionItems.$inferSelect;
export type NewSessionItem = typeof sessionItems.$inferInsert;
