import { Order, type OrderPayment, type OrderStatus, type OrderType } from '@/domain/entity/order';
import type { OrderItemRepository as OrderItemRepositoryContract } from '@/domain/repository/order-item-repository';
import type { OrderPaymentRepository as OrderPaymentRepositoryContract } from '@/domain/repository/order-payment-repository';
import type {
  FindOrderOptions,
  OrderFilters,
  OrderPage,
  OrderRepository as OrderRepositoryContract,
} from '@/domain/repository/order-repository';
import { OrderID, UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate, toNullableDate } from '@/infrastructure/repositories/mapping';

interface OrderRow {
  id: string;
  order_type: OrderType;
  status: OrderStatus;
  table_code: string | null;
  opened_by_user_id: string;
  closed_by_user_id: string | null;
  canceled_by_user_id: string | null;
  opened_at: Date | string;
  closed_at: Date | string | null;
  canceled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  version: number;
}

function mapOrderRow(
  row: OrderRow,
  items: Awaited<ReturnType<OrderItemRepositoryContract['findByOrderId']>>,
  payments: readonly OrderPayment[],
): Order {
  return Order.restore(
    {
      id: new OrderID(row.id),
      type: row.order_type,
      status: row.status,
      tableCode: row.table_code,
      openedByUserId: new UserID(row.opened_by_user_id),
      closedByUserId: row.closed_by_user_id === null ? null : new UserID(row.closed_by_user_id),
      canceledByUserId:
        row.canceled_by_user_id === null ? null : new UserID(row.canceled_by_user_id),
      openedAt: toDate(row.opened_at),
      closedAt: toNullableDate(row.closed_at),
      canceledAt: toNullableDate(row.canceled_at),
      createdAt: toDate(row.created_at),
      updatedAt: toDate(row.updated_at),
      version: row.version,
    },
    items,
    payments,
  );
}

export class OrderRepository implements OrderRepositoryContract {
  constructor(
    private readonly database: DatabaseConnections,
    private readonly orderItems: OrderItemRepositoryContract,
    private readonly orderPayments: OrderPaymentRepositoryContract,
  ) {}

  async create(order: Order): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`
      INSERT INTO orders (
        id,
        order_type,
        status,
        total_amount_cents,
        table_code,
        opened_by_user_id,
        closed_by_user_id,
        canceled_by_user_id,
        opened_at,
        closed_at,
        canceled_at,
        created_at,
        updated_at,
        version
      )
      VALUES (
        ${order.id.value},
        ${order.type},
        ${order.status},
        ${order.total.cents},
        ${order.tableCode},
        ${order.openedByUserId.value},
        ${order.closedByUserId?.value ?? null},
        ${order.canceledByUserId?.value ?? null},
        ${order.openedAt},
        ${order.closedAt},
        ${order.canceledAt},
        ${order.createdAt},
        ${order.updatedAt},
        ${order.version}
      )
    `;

    for (const item of order.items) {
      await this.orderItems.upsert(order.id, item);
    }

    await this.orderPayments.replace(order.id, order.payments);
  }

  async findById(id: OrderID, options?: FindOrderOptions): Promise<Order | null> {
    const sql = options?.forUpdate === true ? this.database.writeSql() : this.database.readSql();
    const rows = await sql.unsafe<OrderRow[]>(
      `SELECT
        id::text AS id,
        order_type,
        status,
        table_code,
        opened_by_user_id::text AS opened_by_user_id,
        closed_by_user_id::text AS closed_by_user_id,
        canceled_by_user_id::text AS canceled_by_user_id,
        opened_at,
        closed_at,
        canceled_at,
        created_at,
        updated_at,
        version
      FROM orders
      WHERE id = $1
      ${options?.forUpdate === true ? 'FOR UPDATE' : ''}`,
      [id.value],
    );

    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    const items = await this.orderItems.findByOrderId(id);
    const payments = await this.orderPayments.findByOrderId(id);
    return mapOrderRow(row, items, payments);
  }

  async save(order: Order): Promise<void> {
    const sql = this.database.writeSql();
    const rows = await sql.query<{ id: string }[]>`
      UPDATE orders
      SET
        order_type = ${order.type},
        status = ${order.status},
        total_amount_cents = ${order.total.cents},
        table_code = ${order.tableCode},
        opened_by_user_id = ${order.openedByUserId.value},
        closed_by_user_id = ${order.closedByUserId?.value ?? null},
        canceled_by_user_id = ${order.canceledByUserId?.value ?? null},
        opened_at = ${order.openedAt},
        closed_at = ${order.closedAt},
        canceled_at = ${order.canceledAt},
        updated_at = ${order.updatedAt},
        version = ${order.version}
      WHERE id = ${order.id.value}
      RETURNING id::text AS id
    `;

    if (rows.length === 0) {
      throw new Error('Order not found');
    }

    for (const item of order.items) {
      await this.orderItems.upsert(order.id, item);
    }

    await this.orderPayments.replace(order.id, order.payments);
  }

  async list(filters: OrderFilters): Promise<OrderPage> {
    const sql = this.database.readSql();
    const offset = (filters.page - 1) * filters.pageSize;
    const status = filters.status ?? null;
    const type = filters.type ?? null;
    const from = filters.from ?? null;
    const to = filters.to ?? null;

    const countRows = await sql.query<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM orders
      WHERE (${status}::order_status IS NULL OR status = ${status}::order_status)
        AND (${type}::order_type IS NULL OR order_type = ${type}::order_type)
        AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
    `;

    const rows = await sql.query<OrderRow[]>`
      SELECT
        id::text AS id,
        order_type,
        status,
        table_code,
        opened_by_user_id::text AS opened_by_user_id,
        closed_by_user_id::text AS closed_by_user_id,
        canceled_by_user_id::text AS canceled_by_user_id,
        opened_at,
        closed_at,
        canceled_at,
        created_at,
        updated_at,
        version
      FROM orders
      WHERE (${status}::order_status IS NULL OR status = ${status}::order_status)
        AND (${type}::order_type IS NULL OR order_type = ${type}::order_type)
        AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
      ORDER BY created_at DESC, id DESC
      LIMIT ${filters.pageSize}
      OFFSET ${offset}
    `;

    const orders = await Promise.all(
      rows.map(async (row) => {
        const orderId = new OrderID(row.id);
        const items = await this.orderItems.findByOrderId(orderId);
        const payments = await this.orderPayments.findByOrderId(orderId);
        return mapOrderRow(row, items, payments);
      }),
    );

    return {
      orders,
      total: Number(countRows[0]?.count ?? 0),
    };
  }
}
