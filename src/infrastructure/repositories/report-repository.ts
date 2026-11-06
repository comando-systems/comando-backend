import { isPaymentMethod } from '@/domain/entity/order';
import type {
  ReportRepository as ReportRepositoryContract,
  SalesRange,
  SalesSummary,
} from '@/domain/repository/report-repository';
import type { DatabaseConnections } from '@/infrastructure/database/connections';

export class ReportRepository implements ReportRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async salesSummary(range: SalesRange): Promise<SalesSummary> {
    const sql = this.database.readSql();

    const [closed] = await sql.query<{ orders: string; revenue: string }[]>`
      SELECT COUNT(*)::text AS orders, COALESCE(SUM(total_amount_cents), 0)::text AS revenue
      FROM orders
      WHERE status = 'CLOSED' AND closed_at >= ${range.from} AND closed_at < ${range.to}
    `;

    const [canceled] = await sql.query<{ orders: string }[]>`
      SELECT COUNT(*)::text AS orders
      FROM orders
      WHERE status = 'CANCELED' AND canceled_at >= ${range.from} AND canceled_at < ${range.to}
    `;

    const [live] = await sql.query<{ orders: string }[]>`
      SELECT COUNT(*)::text AS orders
      FROM orders
      WHERE status IN ('OPEN', 'AWAITING_PAYMENT')
    `;

    const methods = await sql.query<{ method: string; amount: string }[]>`
      SELECT p.method::text AS method, SUM(p.amount_cents)::text AS amount
      FROM order_payments p
      JOIN orders o ON o.id = p.order_id
      WHERE o.status = 'CLOSED' AND o.closed_at >= ${range.from} AND o.closed_at < ${range.to}
      GROUP BY p.method
      ORDER BY p.method
    `;

    return {
      closedOrders: Number(closed?.orders ?? 0),
      revenueCents: Number(closed?.revenue ?? 0),
      canceledOrders: Number(canceled?.orders ?? 0),
      openOrders: Number(live?.orders ?? 0),
      byMethod: methods.map((row) => {
        if (!isPaymentMethod(row.method)) {
          throw new Error('Order payment has an unsupported method in the database');
        }

        return { method: row.method, amountCents: Number(row.amount) };
      }),
    };
  }
}
