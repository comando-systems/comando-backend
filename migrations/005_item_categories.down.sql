-- The primary `items.category` column is unchanged, so dropping these tables restores
-- the catalog to its pre-migration shape without touching historical order lines.
DROP TABLE item_categories;
DROP TABLE categories;
