import { isPaymentMethod, OrderPayment } from '@/domain/entity/order';
import type { OrderPaymentRepository as OrderPaymentRepositoryContract } from '@/domain/repository/order-payment-repository';
import type { OrderID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';

interface OrderPaymentRow {
  order_id?: string;
  method: string;
  amount_cents: string;
  received_cents: string | null;
}

function mapOrderPayment(row: OrderPaymentRow): OrderPayment {
  if (!isPaymentMethod(row.method)) {
    throw new Error('Order payment has an unsupported method in the database');
  }

  return OrderPayment.create({
    method: row.method,
    amountCents: Number(row.amount_cents),
    receivedCents: row.received_cents === null ? null : Number(row.received_cents),
  });
}

export class OrderPaymentRepository implements OrderPaymentRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async findByOrderId(orderId: OrderID): Promise<readonly OrderPayment[]> {
    const sql = this.database.readSql();
    const rows = await sql.query<OrderPaymentRow[]>`
      SELECT
        method::text AS method,
        amount_cents::text AS amount_cents,
        received_cents::text AS received_cents
      FROM order_payments
      WHERE order_id = ${orderId.value}
      ORDER BY id
    `;

    return rows.map(mapOrderPayment);
  }

  async findByOrderIds(
    orderIds: readonly OrderID[],
  ): Promise<ReadonlyMap<string, readonly OrderPayment[]>> {
    const grouped = new Map<string, OrderPayment[]>();
    if (orderIds.length === 0) {
      return grouped;
    }

    const sql = this.database.readSql();
    const rows = await sql.query<Array<OrderPaymentRow & { order_id: string }>>`
      SELECT
        order_id::text AS order_id,
        method::text AS method,
        amount_cents::text AS amount_cents,
        received_cents::text AS received_cents
      FROM order_payments
      WHERE order_id = ANY(string_to_array(${orderIds.map((id) => id.value).join(',')}, ',')::bigint[])
      ORDER BY order_id, id
    `;

    for (const row of rows) {
      const payments = grouped.get(row.order_id) ?? [];
      payments.push(mapOrderPayment(row));
      grouped.set(row.order_id, payments);
    }

    return grouped;
  }

  async replace(orderId: OrderID, payments: readonly OrderPayment[]): Promise<void> {
    await this.database.writeSql()
      .query`DELETE FROM order_payments WHERE order_id = ${orderId.value}`;
    await this.add(orderId, payments);
  }

  async add(orderId: OrderID, payments: readonly OrderPayment[]): Promise<void> {
    if (payments.length === 0) {
      return;
    }

    const columns = 5;
    const params: unknown[] = [];
    const tuples = payments.map((payment, index) => {
      params.push(
        orderId.value,
        payment.method,
        payment.amountCents,
        payment.receivedCents,
        payment.changeCents,
      );
      const base = index * columns;
      return `($${base + 1}, $${base + 2}::payment_method, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    await this.database.writeSql().unsafe(
      `INSERT INTO order_payments (order_id, method, amount_cents, received_cents, change_cents)
      VALUES ${tuples.join(', ')}`,
      params,
    );
  }
}
