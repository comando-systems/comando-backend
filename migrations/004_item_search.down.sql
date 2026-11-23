BEGIN;

DROP INDEX IF EXISTS items_search_vector_idx;
ALTER TABLE items DROP COLUMN IF EXISTS search_vector;

COMMIT;
