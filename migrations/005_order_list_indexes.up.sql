BEGIN;

-- Lists filtered by status (the live orders screen, history by status) read the page straight
-- from this index in sort order instead of sorting every matching row.
CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC, id DESC);

-- The daily summary counts closed and canceled orders in a time range.
CREATE INDEX orders_closed_at_idx ON orders (closed_at) WHERE status = 'CLOSED';
CREATE INDEX orders_canceled_at_idx ON orders (canceled_at) WHERE status = 'CANCELED';

COMMIT;
