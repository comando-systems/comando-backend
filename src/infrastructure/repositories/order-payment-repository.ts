import { isPaymentMethod, OrderPayment } from '@/domain/entity/order';
import type { OrderPaymentRepository as OrderPaymentRepositoryContract } from '@/domain/repository/order-payment-repository';
import type { OrderID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';

interface OrderPaymentRow {
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

  async replace(orderId: OrderID, payments: readonly OrderPayment[]): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`DELETE FROM order_payments WHERE order_id = ${orderId.value}`;

    for (const payment of payments) {
      await sql.query`
        INSERT INTO order_payments (order_id, method, amount_cents, received_cents, change_cents)
        VALUES (
          ${orderId.value},
          ${payment.method}::payment_method,
          ${payment.amountCents},
          ${payment.receivedCents},
          ${payment.changeCents}
        )
      `;
    }
  }
}
