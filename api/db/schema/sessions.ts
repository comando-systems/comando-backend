import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {
  sessionItemStatusEnum,
  sessionStatusEnum,
  sessionTypeEnum,
} from "./enums";
import { users } from "./users";
import { products } from "./products";

export const serviceSessions = pgTable(
  "service_sessions",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    type: sessionTypeEnum("type").notNull(),
    status: sessionStatusEnum("status").notNull().default("OPEN"),
    tableNumber: integer("table_number"),
    openedBy: bigint("opened_by", { mode: "number" })
      .notNull()
      .references(() => users.id),
    closedBy: bigint("closed_by", { mode: "number" }).references(
      () => users.id,
    ),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("service_sessions_open_table_unique")
      .on(table.tableNumber)
      .where(sql`${table.status} = 'OPEN'`),
    check(
      "service_sessions_table_assignment_check",
      sql`(${table.type} = 'TABLE' AND ${table.tableNumber} IS NOT NULL) OR (${table.type} = 'COUNTER' AND ${table.tableNumber} IS NULL)`,
    ),
    check(
      "service_sessions_close_state_check",
      sql`(${table.status} = 'OPEN' AND ${table.closedAt} IS NULL AND ${table.closedBy} IS NULL) OR (${table.status} IN ('CLOSED', 'CANCELLED') AND ${table.closedAt} IS NOT NULL AND ${table.closedBy} IS NOT NULL)`,
    ),
    index("service_sessions_status_idx").on(table.status),
  ],
);

export const sessionItems = pgTable(
  "session_items",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
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
  },
  (table) => [
    check(
      "session_items_quantity_check",
      sql`${table.quantity} > 0`,
    ),
    check(
      "session_items_unit_price_check",
      sql`${table.unitPrice} >= 0`,
    ),
    check(
      "session_items_removal_state_check",
      sql`(${table.status} = 'ACTIVE' AND ${table.removedAt} IS NULL AND ${table.removedBy} IS NULL) OR (${table.status} = 'REMOVED' AND ${table.removedAt} IS NOT NULL AND ${table.removedBy} IS NOT NULL)`,
    ),
    index("session_items_session_id_idx").on(table.sessionId),
  ],
);

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
export type ServiceSessionStatus = ServiceSession["status"];
export type ServiceSessionType = ServiceSession["type"];
export type SessionItem = typeof sessionItems.$inferSelect;
export type NewSessionItem = typeof sessionItems.$inferInsert;
