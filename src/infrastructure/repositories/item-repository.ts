import { Item } from '@/domain/entity/item';
import type { CategoryRepository } from '@/domain/repository/category-repository';
import type {
  CreateItemRecord,
  ItemPage,
  ItemPageOptions,
  ItemRepository as ItemRepositoryContract,
} from '@/domain/repository/item-repository';
import { ItemID } from '@/domain/value-objects/ids';
import { Money } from '@/domain/value-objects/money';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import type { CountCache } from '@/infrastructure/database/count-cache';
import type { SqlClient } from '@/infrastructure/database/sql-client';
import { toDate, toNullableDate } from '@/infrastructure/repositories/mapping';

interface ItemRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price_cents: string;
  image_url: string | null;
  active: boolean;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const ITEM_COLUMNS = `
  id::text AS id,
  name,
  description,
  category,
  price_cents::text AS price_cents,
  image_url,
  active,
  deleted_at,
  created_at,
  updated_at
`;

const SEARCH_ACCENTS_FROM = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const SEARCH_ACCENTS_TO = 'aaaaaeeeeiiiiooooouuuucn';

async function loadCategories(
  sql: SqlClient,
  itemIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (itemIds.length === 0) {
    return new Map();
  }

  const rows = await sql.query<{ item_id: string; name: string }[]>`
    SELECT ic.item_id::text AS item_id, c.name
    FROM item_categories ic
    JOIN categories c ON c.id = ic.category_id
    WHERE ic.item_id = ANY(${sql.array([...itemIds], 'BIGINT')})
    ORDER BY c.name, c.id
  `;

  const byItem = new Map<string, string[]>();
  for (const row of rows) {
    const names = byItem.get(row.item_id) ?? [];
    names.push(row.name);
    byItem.set(row.item_id, names);
  }
  return byItem;
}

function orderedCategories(row: ItemRow, names: readonly string[]): readonly string[] {
  const unique = [...new Set(names)];
  return [row.category, ...unique.filter((name) => name !== row.category)];
}

function mapItem(row: ItemRow, categories: readonly string[]): Item {
  return Item.restore({
    id: new ItemID(row.id),
    name: row.name,
    description: row.description,
    category: row.category,
    categories: orderedCategories(row, categories),
    price: Money.fromCents(Number(row.price_cents)),
    imageUrl: row.image_url,
    active: row.active,
    deletedAt: toNullableDate(row.deleted_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  });
}

export class ItemRepository implements ItemRepositoryContract {
  constructor(
    private readonly database: DatabaseConnections,
    private readonly counts: CountCache,
    private readonly categories: CategoryRepository,
  ) {}

  async existsByName(name: string): Promise<boolean> {
    const rows = await this.database.readSql().query<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM items WHERE lower(name) = lower(${name})
      ) AS exists
    `;

    return rows[0]?.exists === true;
  }

  async findById(id: ItemID): Promise<Item | null> {
    const sql = this.database.readSql();
    const rows = await sql.unsafe<ItemRow[]>(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = $1`, [
      id.value,
    ]);

    const row = rows[0];

    if (row === undefined) {
      return null;
    }

    const byItem = await loadCategories(sql, [row.id]);
    return mapItem(row, byItem.get(row.id) ?? []);
  }

  async findSellableByIds(ids: readonly ItemID[]): Promise<readonly Item[]> {
    if (ids.length === 0) {
      return [];
    }

    const sql = this.database.readSql();
    const rows = await sql.unsafe<ItemRow[]>(
      `SELECT ${ITEM_COLUMNS}
      FROM items
      WHERE id = ANY($1::bigint[])
        AND deleted_at IS NULL
        AND active
      ORDER BY id`,
      [
        sql.array(
          ids.map((id) => id.value),
          'BIGINT',
        ),
      ],
    );

    const byItem = await loadCategories(
      sql,
      rows.map((row) => row.id),
    );
    return rows.map((row) => mapItem(row, byItem.get(row.id) ?? []));
  }

  async create(record: CreateItemRecord): Promise<Item> {
    const sql = this.database.writeSql();
    const draft = Item.create({
      id: new ItemID('1'),
      name: record.name,
      description: record.description,
      category: record.category,
      categories: record.categories,
      priceCents: record.priceCents,
      imageUrl: record.imageUrl,
      active: record.active,
      now: record.now,
    });

    const rows = await sql.query<{ id: string }[]>`
      INSERT INTO items (
        name, description, category, price_cents, image_url, active, created_at, updated_at
      )
      VALUES (
        ${draft.name},
        ${draft.description},
        ${draft.category},
        ${draft.price.cents},
        ${draft.imageUrl},
        ${draft.isEnabled},
        ${draft.createdAt},
        ${draft.updatedAt}
      )
      RETURNING id::text AS id
    `;

    const id = rows[0]?.id;

    if (id === undefined) {
      throw new Error('Failed to create item');
    }

    await this.replaceCategories(id, draft.categories);

    return Item.create({
      id: new ItemID(id),
      name: draft.name,
      description: draft.description,
      categories: draft.categories,
      priceCents: draft.price.cents,
      imageUrl: draft.imageUrl,
      active: draft.isEnabled,
      now: draft.createdAt,
    });
  }

  async update(item: Item): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`
      UPDATE items
      SET
        name = ${item.name},
        description = ${item.description},
        category = ${item.category},
        price_cents = ${item.price.cents},
        image_url = ${item.imageUrl},
        active = ${item.isEnabled},
        deleted_at = ${item.deletedAt},
        updated_at = ${item.updatedAt}
      WHERE id = ${item.id.value}
    `;

    await this.replaceCategories(item.id.value, item.categories);
  }

  async list(options: ItemPageOptions): Promise<ItemPage> {
    const sql = this.database.readSql();
    const offset = (options.page - 1) * options.pageSize;
    const includeRemoved = options.includeRemoved === true;
    const sellableOnly = options.sellableOnly === true;
    const clauses = [
      `(${includeRemoved}::boolean OR deleted_at IS NULL)`,
      `(NOT ${sellableOnly}::boolean OR (deleted_at IS NULL AND active))`,
    ];
    const params: unknown[] = [includeRemoved, sellableOnly];

    if (options.search !== undefined) {
      params.push(options.search);
      clauses.push(
        `search_vector @@ websearch_to_tsquery(
          'simple',
          translate(
            lower($${params.length}::text),
            '${SEARCH_ACCENTS_FROM}',
            '${SEARCH_ACCENTS_TO}'
          )
        )`,
      );
    }

    const where = `WHERE ${clauses.join(' AND ')}`;
    const cacheKey = `items|${includeRemoved}|${sellableOnly}|${options.search ?? ''}`;
    const total = await this.counts.get(cacheKey, async () => {
      const countRows = await sql.unsafe<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM items ${where}`,
        params,
      );
      return Number(countRows[0]?.count ?? 0);
    });
    const rows = await sql.unsafe<ItemRow[]>(
      `SELECT ${ITEM_COLUMNS}
      FROM items
      ${where}
      ORDER BY category, name, id
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}`,
      [...params, options.pageSize, offset],
    );

    const byItem = await loadCategories(
      sql,
      rows.map((row) => row.id),
    );

    return {
      items: rows.map((row) => mapItem(row, byItem.get(row.id) ?? [])),
      total,
    };
  }

  private async replaceCategories(itemId: string, names: readonly string[]): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`DELETE FROM item_categories WHERE item_id = ${itemId}`;

    for (const name of names) {
      const category = await this.categories.findOrCreateByName(name);
      await sql.query`
        INSERT INTO item_categories (item_id, category_id)
        VALUES (${itemId}, ${category.id.value})
        ON CONFLICT (item_id, category_id) DO NOTHING
      `;
    }
  }
}
