-- ADR-02: add the AWAITING_PAYMENT order status.
-- A new enum value cannot be used in the transaction that creates it, so this file only adds
-- the value and 004_order_workflow uses it.

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'CLOSED';
