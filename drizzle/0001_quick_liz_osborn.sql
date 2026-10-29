CREATE UNIQUE INDEX "service_sessions_open_table_unique" ON "service_sessions" USING btree ("table_number") WHERE "service_sessions"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "service_sessions_status_idx" ON "service_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "session_items_session_id_idx" ON "session_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "payments_session_id_idx" ON "payments" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_check" CHECK ("products"."price" >= 0);--> statement-breakpoint
ALTER TABLE "service_sessions" ADD CONSTRAINT "service_sessions_table_assignment_check" CHECK (("service_sessions"."type" = 'TABLE' AND "service_sessions"."table_number" IS NOT NULL) OR ("service_sessions"."type" = 'COUNTER' AND "service_sessions"."table_number" IS NULL));--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_quantity_check" CHECK ("session_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_unit_price_check" CHECK ("session_items"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0);--> statement-breakpoint
INSERT INTO "roles" ("name") VALUES ('ADMIN'), ('CAIXA'), ('GARCOM') ON CONFLICT ("name") DO NOTHING;