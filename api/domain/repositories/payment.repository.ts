// Bun SQL implementation of the payment repository. Payments are append-only.
import { db, type DbExecutor } from "@/db";
import { requireRow, toNumber } from "@/db/helpers";
import type {
  IPaymentRepository,
  NewPayment,
  Payment,
} from "@/domain/payments";

type PaymentRow = Omit<Payment, "id" | "sessionId" | "receivedBy"> & {
  id: bigint;
  sessionId: bigint;
  receivedBy: bigint;
};

function mapPayment(row: PaymentRow): Payment {
  return {
    id: toNumber(row.id),
    sessionId: toNumber(row.sessionId),
    amount: row.amount,
    method: row.method,
    receivedBy: toNumber(row.receivedBy),
    paidAt: row.paidAt,
    notes: row.notes,
  };
}

export class PaymentRepository implements IPaymentRepository {
  async findBySessionId(
    sessionId: number,
    client: DbExecutor = db,
  ): Promise<Payment[]> {
    const rows = await client<PaymentRow[]>`
      select * from payments
      where session_id = ${sessionId}
      order by paid_at, id
    `;
    return rows.map(mapPayment);
  }

  async create(data: NewPayment, client: DbExecutor = db): Promise<Payment> {
    const [row] = await client<PaymentRow[]>`
      insert into payments ${client(data)} returning *
    `;
    return mapPayment(requireRow(row, "Failed to create payment"));
  }
}

export const paymentRepository = new PaymentRepository();
