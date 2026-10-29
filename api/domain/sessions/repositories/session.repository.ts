import { and, desc, eq } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { requireRow } from "@/db/helpers";
import {
  serviceSessions,
  type NewServiceSession,
  type ServiceSession,
  type ServiceSessionStatus,
} from "@/db/schema/sessions";

export interface ISessionRepository {
  findById(id: number, client?: DbExecutor): Promise<ServiceSession | undefined>;
  findByIdForUpdate(
    id: number,
    client?: DbExecutor,
  ): Promise<ServiceSession | undefined>;
  findOpenByTableNumber(
    tableNumber: number,
    client?: DbExecutor,
  ): Promise<ServiceSession | undefined>;
  findByStatus(
    status?: ServiceSessionStatus,
    client?: DbExecutor,
  ): Promise<ServiceSession[]>;
  findAllOpen(client?: DbExecutor): Promise<ServiceSession[]>;
  create(
    data: NewServiceSession,
    client?: DbExecutor,
  ): Promise<ServiceSession>;
  close(id: number, closedBy: number, client?: DbExecutor): Promise<ServiceSession | undefined>;
  cancel(id: number, closedBy: number, client?: DbExecutor): Promise<ServiceSession | undefined>;
}

export class SessionRepository implements ISessionRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    const [session] = await client
      .select()
      .from(serviceSessions)
      .where(eq(serviceSessions.id, id));
    return session;
  }

  async findByIdForUpdate(
    id: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    const [session] = await client
      .select()
      .from(serviceSessions)
      .where(eq(serviceSessions.id, id))
      .for("update");
    return session;
  }

  async findOpenByTableNumber(
    tableNumber: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    const [session] = await client
      .select()
      .from(serviceSessions)
      .where(
        and(
          eq(serviceSessions.tableNumber, tableNumber),
          eq(serviceSessions.status, "OPEN"),
        ),
      );
    return session;
  }

  async findByStatus(
    status?: ServiceSessionStatus,
    client: DbExecutor = db,
  ): Promise<ServiceSession[]> {
    if (status) {
      return client
        .select()
        .from(serviceSessions)
        .where(eq(serviceSessions.status, status))
        .orderBy(desc(serviceSessions.openedAt));
    }

    return client
      .select()
      .from(serviceSessions)
      .orderBy(desc(serviceSessions.openedAt));
  }

  async findAllOpen(client: DbExecutor = db): Promise<ServiceSession[]> {
    return this.findByStatus("OPEN", client);
  }

  async create(
    data: NewServiceSession,
    client: DbExecutor = db,
  ): Promise<ServiceSession> {
    const [session] = await client
      .insert(serviceSessions)
      .values(data)
      .returning();
    return requireRow(session, "Failed to create service session");
  }

  async close(
    id: number,
    closedBy: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    const [session] = await client
      .update(serviceSessions)
      .set({ status: "CLOSED", closedBy, closedAt: new Date() })
      .where(
        and(
          eq(serviceSessions.id, id),
          eq(serviceSessions.status, "OPEN"),
        ),
      )
      .returning();
    return session;
  }

  async cancel(
    id: number,
    closedBy: number,
    client: DbExecutor = db,
  ): Promise<ServiceSession | undefined> {
    const [session] = await client
      .update(serviceSessions)
      .set({ status: "CANCELLED", closedBy, closedAt: new Date() })
      .where(
        and(
          eq(serviceSessions.id, id),
          eq(serviceSessions.status, "OPEN"),
        ),
      )
      .returning();
    return session;
  }
}

export const sessionRepository = new SessionRepository();
