import { OrderItem } from '@/domain/entity/order';
import type { OrderItemRepository as OrderItemRepositoryContract } from '@/domain/repository/order-item-repository';
import { ItemID, OrderID } from '@/domain/value-objects/ids';
import { Money } from '@/domain/value-objects/money';
import { OrderItemKey } from '@/domain/value-objects/order-item-key';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate } from '@/infrastructure/repositories/mapping';

interface OrderItemRow {
  order_id: string;
  item_id: string;
  item_name_snapshot: string;
  quantity: number;
  unit_price_cents: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapOrderItem(row: OrderItemRow): OrderItem {
  return OrderItem.restore({
    key: new OrderItemKey(new OrderID(row.order_id), new ItemID(row.item_id)),
    itemName: row.item_name_snapshot,
    quantity: row.quantity,
    unitPrice: Money.fromCents(Number(row.unit_price_cents)),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  });
}

export class OrderItemRepository implements OrderItemRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async findByOrderId(orderId: OrderID): Promise<readonly OrderItem[]> {
    const sql = this.database.readSql();
    const rows = await sql.query<OrderItemRow[]>`
      SELECT
        order_id::text AS order_id,
        item_id::text AS item_id,
        item_name_snapshot,
        quantity,
        unit_price_cents::text AS unit_price_cents,
        created_at,
        updated_at
      FROM order_items
      WHERE order_id = ${orderId.value}
      ORDER BY item_id
    `;

    return rows.map(mapOrderItem);
  }

  async upsert(orderId: OrderID, item: OrderItem): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`
      INSERT INTO order_items (
        order_id,
        item_id,
        item_name_snapshot,
        quantity,
        unit_price_cents,
        created_at,
        updated_at
      )
      VALUES (
        ${orderId.value},
        ${item.itemId.value},
        ${item.itemName},
        ${item.quantity},
        ${item.unitPrice.cents},
        ${item.createdAt},
        ${item.updatedAt}
      )
      ON CONFLICT (order_id, item_id)
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at
    `;
  }

  async delete(orderId: OrderID, itemId: ItemID): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`
      DELETE FROM order_items
      WHERE order_id = ${orderId.value} AND item_id = ${itemId.value}
    `;
  }

  async deleteExcept(orderId: OrderID, keep: readonly ItemID[]): Promise<void> {
    const sql = this.database.writeSql();

    if (keep.length === 0) {
      await sql.query`DELETE FROM order_items WHERE order_id = ${orderId.value}`;
      return;
    }

    await sql.query`
      DELETE FROM order_items
      WHERE order_id = ${orderId.value}
        AND item_id <> ALL(${sql.array(
          keep.map((itemId) => itemId.value),
          'BIGINT',
        )})
    `;
  }
}
