import { Item } from '@/domain/entity/item';
import type {
  CreateItemRecord,
  ItemPage,
  ItemPageOptions,
  ItemRepository as ItemRepositoryContract,
} from '@/domain/repository/item-repository';
import { ItemID } from '@/domain/value-objects/ids';
import { Money } from '@/domain/value-objects/money';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate, toNullableDate } from '@/infrastructure/repositories/mapping';

interface ItemRow {
  id: string;
  name: string;
  description: string | null;
  price_cents: string;
  image_url: string | null;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapItem(row: ItemRow): Item {
  return Item.restore({
    id: new ItemID(row.id),
    name: row.name,
    description: row.description,
    price: Money.fromCents(Number(row.price_cents)),
    imageUrl: row.image_url,
    deletedAt: toNullableDate(row.deleted_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  });
}

export class ItemRepository implements ItemRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async findById(id: ItemID): Promise<Item | null> {
    const sql = this.database.readSql();
    const rows = await sql.query<ItemRow[]>`
      SELECT
        id::text AS id,
        name,
        description,
        price_cents::text AS price_cents,
        image_url,
        deleted_at,
        created_at,
        updated_at
      FROM items
      WHERE id = ${id.value}
    `;

    const row = rows[0];
    return row === undefined ? null : mapItem(row);
  }

  async findActiveByIds(ids: readonly ItemID[]): Promise<readonly Item[]> {
    if (ids.length === 0) {
      return [];
    }

    const sql = this.database.readSql();
    const rows = await sql.query<ItemRow[]>`
      SELECT
        id::text AS id,
        name,
        description,
        price_cents::text AS price_cents,
        image_url,
        deleted_at,
        created_at,
        updated_at
      FROM items
      WHERE id = ANY(${sql.array(
        ids.map((id) => id.value),
        'BIGINT',
      )})
        AND deleted_at IS NULL
      ORDER BY id
    `;

    return rows.map(mapItem);
  }

  async create(record: CreateItemRecord): Promise<Item> {
    const sql = this.database.writeSql();
    const rows = await sql.query<{ id: string }[]>`
      INSERT INTO items (name, description, price_cents, image_url, created_at, updated_at)
      VALUES (
        ${record.name},
        ${record.description},
        ${record.priceCents},
        ${record.imageUrl},
        ${record.now},
        ${record.now}
      )
      RETURNING id::text AS id
    `;

    const id = rows[0]?.id;

    if (id === undefined) {
      throw new Error('Failed to create item');
    }

    return Item.create({
      id: new ItemID(id),
      name: record.name,
      description: record.description,
      priceCents: record.priceCents,
      imageUrl: record.imageUrl,
      now: record.now,
    });
  }

  async update(item: Item): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`
      UPDATE items
      SET
        name = ${item.name},
        description = ${item.description},
        price_cents = ${item.price.cents},
        image_url = ${item.imageUrl},
        deleted_at = ${item.deletedAt},
        updated_at = ${item.updatedAt}
      WHERE id = ${item.id.value}
    `;
  }

  async list(options: ItemPageOptions): Promise<ItemPage> {
    const sql = this.database.readSql();
    const offset = (options.page - 1) * options.pageSize;
    const includeRemoved = options.includeRemoved === true;
    const countRows = await sql.query<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM items
      WHERE (${includeRemoved}::boolean OR deleted_at IS NULL)
    `;
    const rows = await sql.query<ItemRow[]>`
      SELECT
        id::text AS id,
        name,
        description,
        price_cents::text AS price_cents,
        image_url,
        deleted_at,
        created_at,
        updated_at
      FROM items
      WHERE (${includeRemoved}::boolean OR deleted_at IS NULL)
      ORDER BY name, id
      LIMIT ${options.pageSize}
      OFFSET ${offset}
    `;

    return {
      items: rows.map(mapItem),
      total: Number(countRows[0]?.count ?? 0),
    };
  }
}
