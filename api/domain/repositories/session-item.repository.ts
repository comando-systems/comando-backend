// Bun SQL implementation of the session-item repository. Removals are logical
// updates that preserve author and timestamp for auditing.
import { db, type DbExecutor } from "@/db";
import {
  requireRow,
  toNullableNumber,
  toNumber,
} from "@/db/helpers";
import type {
  ISessionItemRepository,
  NewSessionItem,
  SessionItem,
} from "@/domain/sessions";

type SessionItemRow = Omit<
  SessionItem,
  "id" | "sessionId" | "productId" | "addedBy" | "removedBy"
> & {
  id: bigint;
  sessionId: bigint;
  productId: bigint;
  addedBy: bigint;
  removedBy: bigint | null;
};

function mapSessionItem(row: SessionItemRow): SessionItem {
  return {
    id: toNumber(row.id),
    sessionId: toNumber(row.sessionId),
    productId: toNumber(row.productId),
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    status: row.status,
    addedBy: toNumber(row.addedBy),
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    removedAt: row.removedAt,
    removedBy: toNullableNumber(row.removedBy),
  };
}

export class SessionItemRepository implements ISessionItemRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<SessionItem | undefined> {
    const [row] = await client<SessionItemRow[]>`
      select * from session_items where id = ${id}
    `;
    return row ? mapSessionItem(row) : undefined;
  }

  private async findForSession(
    sessionId: number,
    client: DbExecutor,
    status?: SessionItem["status"],
  ): Promise<SessionItem[]> {
    const rows = status
      ? await client<SessionItemRow[]>`
          select * from session_items
          where session_id = ${sessionId} and status = ${status}
          order by added_at, id
        `
      : await client<SessionItemRow[]>`
          select * from session_items
          where session_id = ${sessionId}
          order by added_at, id
        `;

    return rows.map(mapSessionItem);
  }

  async findBySessionId(
    sessionId: number,
    client: DbExecutor = db,
  ): Promise<SessionItem[]> {
    return this.findForSession(sessionId, client);
  }

  async findActiveBySessionId(
    sessionId: number,
    client: DbExecutor = db,
  ): Promise<SessionItem[]> {
    return this.findForSession(sessionId, client, "ACTIVE");
  }

  async add(
    data: NewSessionItem,
    client: DbExecutor = db,
  ): Promise<SessionItem> {
    const [row] = await client<SessionItemRow[]>`
      insert into session_items ${client(data)} returning *
    `;
    return mapSessionItem(requireRow(row, "Failed to add session item"));
  }

  // The ACTIVE predicate prevents double-removal and keeps the audit fields
  // consistent with the database removal-state check.
  async removeForSession(
    sessionId: number,
    itemId: number,
    removedBy: number,
    client: DbExecutor = db,
  ): Promise<SessionItem | undefined> {
    const [row] = await client<SessionItemRow[]>`
      update session_items
      set status = 'REMOVED', removed_by = ${removedBy}, removed_at = now(), updated_at = now()
      where id = ${itemId} and session_id = ${sessionId} and status = 'ACTIVE'
      returning *
    `;
    return row ? mapSessionItem(row) : undefined;
  }
}

export const sessionItemRepository = new SessionItemRepository();
