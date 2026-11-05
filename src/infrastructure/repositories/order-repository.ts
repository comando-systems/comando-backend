import {
  type Adjustment,
  type AdjustmentMode,
  type AdjustmentType,
  Order,
  type OrderPayment,
  type OrderStatus,
  type OrderType,
} from '@/domain/entity/order';
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
  label: string | null;
  opened_by_user_id: string;
  closed_by_user_id: string | null;
  canceled_by_user_id: string | null;
  payment_requested_by_user_id: string | null;
  payment_requested_at: Date | string | null;
  adjustment_type: AdjustmentType | null;
  adjustment_mode: AdjustmentMode | null;
  adjustment_value: string;
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
  adjustment_type,
  adjustment_mode,
  adjustment_value::text AS adjustment_value,
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

function mapAdjustment(row: OrderRow): Adjustment | null {
  if (row.adjustment_type === null || row.adjustment_mode === null) {
    return null;
  }

  return {
    type: row.adjustment_type,
    mode: row.adjustment_mode,
    value: Number(row.adjustment_value),
  };
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
      adjustment: mapAdjustment(row),
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

export class OrderRepository implements OrderRepositoryContract {
  constructor(
    private readonly database: DatabaseConnections,
    private readonly orderItems: OrderItemRepositoryContract,
    private readonly orderPayments: OrderPaymentRepositoryContract,
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
        adjustment_type,
        adjustment_mode,
        adjustment_value,
        adjustment_cents,
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
        ${order.adjustment?.type ?? null},
        ${order.adjustment?.mode ?? null},
        ${order.adjustment?.value ?? 0},
        ${pricing.adjustment.cents},
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

    for (const item of order.items) {
      await this.orderItems.upsert(order.id, item);
    }

    await this.orderPayments.replace(order.id, order.payments);
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
        adjustment_type = ${order.adjustment?.type ?? null},
        adjustment_mode = ${order.adjustment?.mode ?? null},
        adjustment_value = ${order.adjustment?.value ?? 0},
        adjustment_cents = ${pricing.adjustment.cents},
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

    for (const item of order.items) {
      await this.orderItems.upsert(order.id, item);
    }

    await this.orderPayments.replace(order.id, order.payments);
  }

  async list(filters: OrderFilters): Promise<OrderPage> {
    const sql = this.database.readSql();
    const offset = (filters.page - 1) * filters.pageSize;
    const status = filters.status ?? null;
    // A comma-joined list avoids array parameters; statuses never contain commas.
    const statuses = filters.statuses === undefined ? null : filters.statuses.join(',');
    const type = filters.type ?? null;
    const tableCode = filters.tableCode ?? null;
    const from = filters.from ?? null;
    const to = filters.to ?? null;

    const countRows = await sql.query<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM orders
      WHERE (${status}::order_status IS NULL OR status = ${status}::order_status)
        AND (${statuses}::text IS NULL OR status::text = ANY(string_to_array(${statuses}::text, ',')))
        AND (${type}::order_type IS NULL OR order_type = ${type}::order_type)
        AND (${tableCode}::text IS NULL OR table_code = ${tableCode}::text)
        AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
    `;

    const rows = await sql.unsafe<OrderRow[]>(
      `SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE ($1::order_status IS NULL OR status = $1::order_status)
        AND ($2::order_type IS NULL OR order_type = $2::order_type)
        AND ($3::timestamptz IS NULL OR created_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR created_at <= $4::timestamptz)
        AND ($5::text IS NULL OR status::text = ANY(string_to_array($5::text, ',')))
        AND ($6::text IS NULL OR table_code = $6::text)
      ORDER BY created_at DESC, id DESC
      LIMIT $7
      OFFSET $8`,
      [status, type, from, to, statuses, tableCode, filters.pageSize, offset],
    );

    const orders = await Promise.all(rows.map((row) => this.hydrate(row) as Promise<Order>));

    return {
      orders,
      total: Number(countRows[0]?.count ?? 0),
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
