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
import { Money } from '@/domain/value-objects/money';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import type { CountCache } from '@/infrastructure/database/count-cache';
import { toDate, toNullableDate } from '@/infrastructure/repositories/mapping';

interface OrderRow {
  id: string;
  order_type: OrderType;
  status: OrderStatus;
  table_code: string | null;
  label: string | null;
  opened_by_user_id: string;
  closed_by_user_id: string | null;
  canceled_by_user_id: string | null;
  payment_requested_by_user_id: string | null;
  payment_requested_at: Date | string | null;
  surcharge_cents: string;
  discount_cents: string;
  apply_service_fee: boolean;
  service_fee_basis_points: number;
  opened_at: Date | string;
  closed_at: Date | string | null;
  canceled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  version: number;
}

// One column list for every read, so a new column cannot be forgotten in one query.
const ORDER_COLUMNS = `
  id::text AS id,
  order_type,
  status,
  table_code,
  label,
  opened_by_user_id::text AS opened_by_user_id,
  closed_by_user_id::text AS closed_by_user_id,
  canceled_by_user_id::text AS canceled_by_user_id,
  payment_requested_by_user_id::text AS payment_requested_by_user_id,
  payment_requested_at,
  surcharge_cents::text AS surcharge_cents,
  discount_cents::text AS discount_cents,
  apply_service_fee,
  service_fee_basis_points,
  opened_at,
  closed_at,
  canceled_at,
  created_at,
  updated_at,
  version
`;

function optionalUserId(value: string | null): UserID | null {
  return value === null ? null : new UserID(value);
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
      label: row.label,
      openedByUserId: new UserID(row.opened_by_user_id),
      closedByUserId: optionalUserId(row.closed_by_user_id),
      canceledByUserId: optionalUserId(row.canceled_by_user_id),
      paymentRequestedByUserId: optionalUserId(row.payment_requested_by_user_id),
      paymentRequestedAt: toNullableDate(row.payment_requested_at),
      surcharge: Money.fromCents(Number(row.surcharge_cents)),
      discount: Money.fromCents(Number(row.discount_cents)),
      applyServiceFee: row.apply_service_fee,
      serviceFeeBasisPoints: row.service_fee_basis_points,
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

function listConditions(filters: OrderFilters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown, clause: (placeholder: string) => string): void => {
    params.push(value);
    clauses.push(clause(`$${params.length}`));
  };

  if (filters.status != null) add(filters.status, (p) => `status = ${p}::order_status`);
  if (filters.statuses !== undefined) {
    // A comma-joined list avoids array parameters; statuses never contain commas.
    add(
      filters.statuses.join(','),
      (p) => `status = ANY(string_to_array(${p}, ',')::order_status[])`,
    );
  }
  if (filters.type != null) add(filters.type, (p) => `order_type = ${p}::order_type`);
  if (filters.tableCode != null) add(filters.tableCode, (p) => `table_code = ${p}::text`);
  if (filters.from != null) add(filters.from, (p) => `created_at >= ${p}::timestamptz`);
  if (filters.to != null) add(filters.to, (p) => `created_at <= ${p}::timestamptz`);

  return { where: clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`, params };
}

export class OrderRepository implements OrderRepositoryContract {
  constructor(
    private readonly database: DatabaseConnections,
    private readonly orderItems: OrderItemRepositoryContract,
    private readonly orderPayments: OrderPaymentRepositoryContract,
    private readonly counts: CountCache,
  ) {}

  async create(order: Order): Promise<void> {
    const sql = this.database.writeSql();
    const pricing = order.pricing;
    await sql.query`
      INSERT INTO orders (
        id,
        order_type,
        status,
        total_amount_cents,
        table_code,
        label,
        opened_by_user_id,
        closed_by_user_id,
        canceled_by_user_id,
        payment_requested_by_user_id,
        payment_requested_at,
        surcharge_cents,
        discount_cents,
        apply_service_fee,
        service_fee_basis_points,
        service_fee_cents,
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
        ${pricing.total.cents},
        ${order.tableCode},
        ${order.label},
        ${order.openedByUserId.value},
        ${order.closedByUserId?.value ?? null},
        ${order.canceledByUserId?.value ?? null},
        ${order.paymentRequestedByUserId?.value ?? null},
        ${order.paymentRequestedAt},
        ${pricing.surcharge.cents},
        ${pricing.discount.cents},
        ${order.applyServiceFee},
        ${order.serviceFeeBasisPoints},
        ${pricing.serviceFee.cents},
        ${order.openedAt},
        ${order.closedAt},
        ${order.canceledAt},
        ${order.createdAt},
        ${order.updatedAt},
        ${order.version}
      )
    `;

    // A new order has no stored lines or payments yet, so each is one insert without a delete.
    await this.orderItems.upsertMany(order.id, order.items);
    await this.orderPayments.add(order.id, order.payments);
  }

  async findById(id: OrderID, options?: FindOrderOptions): Promise<Order | null> {
    const sql = options?.forUpdate === true ? this.database.writeSql() : this.database.readSql();
    const rows = await sql.unsafe<OrderRow[]>(
      `SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE id = $1
      ${options?.forUpdate === true ? 'FOR UPDATE' : ''}`,
      [id.value],
    );

    return this.hydrate(rows[0]);
  }

  async findActiveTableByCode(tableCode: string): Promise<Order | null> {
    const sql = this.database.readSql();
    const rows = await sql.unsafe<OrderRow[]>(
      `SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE order_type = 'TABLE'
        AND status IN ('OPEN', 'AWAITING_PAYMENT')
        AND table_code = $1`,
      [tableCode],
    );

    return this.hydrate(rows[0]);
  }

  async save(order: Order): Promise<void> {
    const sql = this.database.writeSql();
    const pricing = order.pricing;
    const rows = await sql.query<{ id: string }[]>`
      UPDATE orders
      SET
        order_type = ${order.type},
        status = ${order.status},
        total_amount_cents = ${pricing.total.cents},
        table_code = ${order.tableCode},
        label = ${order.label},
        opened_by_user_id = ${order.openedByUserId.value},
        closed_by_user_id = ${order.closedByUserId?.value ?? null},
        canceled_by_user_id = ${order.canceledByUserId?.value ?? null},
        payment_requested_by_user_id = ${order.paymentRequestedByUserId?.value ?? null},
        payment_requested_at = ${order.paymentRequestedAt},
        surcharge_cents = ${pricing.surcharge.cents},
        discount_cents = ${pricing.discount.cents},
        apply_service_fee = ${order.applyServiceFee},
        service_fee_basis_points = ${order.serviceFeeBasisPoints},
        service_fee_cents = ${pricing.serviceFee.cents},
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

    await this.orderItems.deleteExcept(
      order.id,
      order.items.map((item) => item.itemId),
    );

    await this.orderItems.upsertMany(order.id, order.items);
    await this.orderPayments.replace(order.id, order.payments);
  }

  async list(filters: OrderFilters): Promise<OrderPage> {
    const sql = this.database.readSql();
    const { where, params } = listConditions(filters);
    const offset = (filters.page - 1) * filters.pageSize;

    // Only the filters that were sent reach the SQL, so the planner can use the indexes instead of
    // scanning the table for `$1 IS NULL OR ...` conditions.
    const [total, rows] = await Promise.all([
      this.counts.get(`orders|${where}|${JSON.stringify(params)}`, async () => {
        const countRows = await sql.unsafe<{ count: string }[]>(
          `SELECT COUNT(*)::text AS count FROM orders ${where}`,
          params,
        );
        return Number(countRows[0]?.count ?? 0);
      }),
      sql.unsafe<OrderRow[]>(
        `SELECT ${ORDER_COLUMNS}
        FROM orders
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}`,
        [...params, filters.pageSize, offset],
      ),
    ]);

    // Two queries for the whole page instead of two per order.
    const ids = rows.map((row) => new OrderID(row.id));
    const [items, payments] = await Promise.all([
      this.orderItems.findByOrderIds(ids),
      this.orderPayments.findByOrderIds(ids),
    ]);

    return {
      orders: rows.map((row) =>
        mapOrderRow(row, items.get(row.id) ?? [], payments.get(row.id) ?? []),
      ),
      total,
    };
  }

  private async hydrate(row: OrderRow | undefined): Promise<Order | null> {
    if (row === undefined) {
      return null;
    }

    const orderId = new OrderID(row.id);
    const items = await this.orderItems.findByOrderId(orderId);
    const payments = await this.orderPayments.findByOrderId(orderId);
    return mapOrderRow(row, items, payments);
  }
}
