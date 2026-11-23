-- Server-side catalog search. The generated vector keeps search data in sync with the item
-- columns, and the partial index covers every list served to staff.

BEGIN;

ALTER TABLE items
    ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector(
            'simple',
            translate(
                lower(
                    coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || category
                ),
                'áàâãäéèêëíìîïóòôõöúùûüçñ',
                'aaaaaeeeeiiiiooooouuuucn'
            )
        )
    ) STORED;

CREATE INDEX items_search_vector_idx ON items USING GIN (search_vector)
    WHERE deleted_at IS NULL AND active;

COMMIT;
