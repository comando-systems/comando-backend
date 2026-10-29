import { and, asc, eq } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { requireRow } from "@/db/helpers";
import {
  sessionItems,
  type NewSessionItem,
  type SessionItem,
} from "@/db/schema/sessions";

export interface ISessionItemRepository {
  findById(id: number, client?: DbExecutor): Promise<SessionItem | undefined>;
  findBySessionId(
    sessionId: number,
    client?: DbExecutor,
  ): Promise<SessionItem[]>;
  findActiveBySessionId(
    sessionId: number,
    client?: DbExecutor,
  ): Promise<SessionItem[]>;
  add(data: NewSessionItem, client?: DbExecutor): Promise<SessionItem>;
  removeForSession(
    sessionId: number,
    itemId: number,
    removedBy: number,
    client?: DbExecutor,
  ): Promise<SessionItem | undefined>;
}

export class SessionItemRepository implements ISessionItemRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<SessionItem | undefined> {
    const [item] = await client
      .select()
      .from(sessionItems)
      .where(eq(sessionItems.id, id));
    return item;
  }

  async findBySessionId(
    sessionId: number,
    client: DbExecutor = db,
  ): Promise<SessionItem[]> {
    return client
      .select()
      .from(sessionItems)
      .where(eq(sessionItems.sessionId, sessionId))
      .orderBy(asc(sessionItems.addedAt), asc(sessionItems.id));
  }

  async findActiveBySessionId(
    sessionId: number,
    client: DbExecutor = db,
  ): Promise<SessionItem[]> {
    return client
      .select()
      .from(sessionItems)
      .where(
        and(
          eq(sessionItems.sessionId, sessionId),
          eq(sessionItems.status, "ACTIVE"),
        ),
      )
      .orderBy(asc(sessionItems.addedAt), asc(sessionItems.id));
  }

  async add(
    data: NewSessionItem,
    client: DbExecutor = db,
  ): Promise<SessionItem> {
    const [item] = await client
      .insert(sessionItems)
      .values(data)
      .returning();
    return requireRow(item, "Failed to add session item");
  }

  async removeForSession(
    sessionId: number,
    itemId: number,
    removedBy: number,
    client: DbExecutor = db,
  ): Promise<SessionItem | undefined> {
    const [item] = await client
      .update(sessionItems)
      .set({
        status: "REMOVED",
        removedBy,
        removedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sessionItems.id, itemId),
          eq(sessionItems.sessionId, sessionId),
          eq(sessionItems.status, "ACTIVE"),
        ),
      )
      .returning();
    return item;
  }
}

export const sessionItemRepository = new SessionItemRepository();
