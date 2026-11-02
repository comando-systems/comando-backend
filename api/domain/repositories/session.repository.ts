// Bun SQL implementation of the session repository. Row locks are used by
// mutating flows; conditional updates guard against concurrent state changes.
import { db, type DbExecutor } from "@/db";
import { requireRow, toNullableNumber, toNumber } from "@/db/helpers";
import type {
  ISessionRepository,
  NewServiceSession,
  ServiceSession,
  SessionStatus,
} from "@/domain/sessions";

type SessionRow = Omit<
  ServiceSession,
  "id" | "openedBy" | "closedBy"
> & {
  id: bigint;
  openedBy: bigint;
  closedBy: bigint | null;
};

function mapSession(row: SessionRow): ServiceSession {
  return {
    id: toNumber(row.id),
    type: row.type,
    status: row.status,
    tableNumber: row.tableNumber,
    openedBy: toNumber(row.openedBy),
    closedBy: toNullableNumber(row.closedBy),
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    notes: row.notes,
  };
}

export class SessionRepository implements ISessionRepository {
  private async findOne(
    id: number,
    client: DbExecutor,
    forUpdate = false,
  ): Promise<ServiceSession | undefined> {
    const [row] = forUpdate
      ? await client<SessionRow[]>`
          select * from service_sessions where id = ${id} for update
        `
      : await client<SessionRow[]>`
          select * from service_sessions where id = ${id}
        `;

    return row ? mapSession(row) : undefined;
  }

  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    return this.findOne(id, client);
  }

  // SELECT ... FOR UPDATE serializes close/cancel/item mutations per session.
  async findByIdForUpdate(
    id: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    return this.findOne(id, client, true);
  }

  // Backed by the partial unique index on open TABLE sessions.
  async findOpenByTableNumber(
    tableNumber: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    const [row] = await client<SessionRow[]>`
      select * from service_sessions
      where table_number = ${tableNumber} and status = 'OPEN'
    `;
    return row ? mapSession(row) : undefined;
  }

  async findByStatus(
    status?: SessionStatus,
    client: DbExecutor = db,
  ): Promise<ServiceSession[]> {
    const rows = status
      ? await client<SessionRow[]>`
          select * from service_sessions
          where status = ${status}
          order by opened_at desc
        `
      : await client<SessionRow[]>`
          select * from service_sessions order by opened_at desc
        `;

    return rows.map(mapSession);
  }

  async findAllOpen(client: DbExecutor = db): Promise<ServiceSession[]> {
    return this.findByStatus("OPEN", client);
  }

  async create(
    data: NewServiceSession,
    client: DbExecutor = db,
  ): Promise<ServiceSession> {
    const [row] = await client<SessionRow[]>`
      insert into service_sessions ${client(data)} returning *
    `;
    return mapSession(requireRow(row, "Failed to create service session"));
  }

  // The status predicate makes the transition safe if another request won the race.
  private async finish(
    id: number,
    status: "CLOSED" | "CANCELLED",
    closedBy: number,
    client: DbExecutor,
  ): Promise<ServiceSession | undefined> {
    const [row] = await client<SessionRow[]>`
      update service_sessions
      set status = ${status}, closed_by = ${closedBy}, closed_at = now()
      where id = ${id} and status = 'OPEN'
      returning *
    `;
    return row ? mapSession(row) : undefined;
  }

  async close(
    id: number,
    closedBy: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    return this.finish(id, "CLOSED", closedBy, client);
  }

  async cancel(
    id: number,
    closedBy: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    return this.finish(id, "CANCELLED", closedBy, client);
  }
}

export const sessionRepository = new SessionRepository();
