import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  serviceSessions,
  type NewServiceSession,
  type ServiceSession,
} from "@/db/schema/sessions";

export interface ISessionRepository {
  findById(id: number): Promise<ServiceSession | undefined>;
  findOpenByTableNumber(tableNumber: number): Promise<ServiceSession | undefined>;
  findAllOpen(): Promise<ServiceSession[]>;
  create(data: NewServiceSession): Promise<ServiceSession>;
  close(id: number, closedBy: number): Promise<ServiceSession | undefined>;
  cancel(id: number, closedBy: number): Promise<ServiceSession | undefined>;
}

export class SessionRepository implements ISessionRepository {
  async findById(id: number): Promise<ServiceSession | undefined> {
    const [session] = await db
      .select()
      .from(serviceSessions)
      .where(eq(serviceSessions.id, id));
    return session;
  }

  async findOpenByTableNumber(tableNumber: number): Promise<ServiceSession | undefined> {
    const [session] = await db
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

  async findAllOpen(): Promise<ServiceSession[]> {
    return db
      .select()
      .from(serviceSessions)
      .where(eq(serviceSessions.status, "OPEN"));
  }

  async create(data: NewServiceSession): Promise<ServiceSession> {
    const [session] = await db
      .insert(serviceSessions)
      .values(data)
      .returning();
    return session;
  }

  async close(id: number, closedBy: number): Promise<ServiceSession | undefined> {
    const [session] = await db
      .update(serviceSessions)
      .set({ status: "CLOSED", closedBy, closedAt: new Date() })
      .where(eq(serviceSessions.id, id))
      .returning();
    return session;
  }

  async cancel(id: number, closedBy: number): Promise<ServiceSession | undefined> {
    const [session] = await db
      .update(serviceSessions)
      .set({ status: "CANCELLED", closedBy, closedAt: new Date() })
      .where(eq(serviceSessions.id, id))
      .returning();
    return session;
  }
}

export const sessionRepository = new SessionRepository();
