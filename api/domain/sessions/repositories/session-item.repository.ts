import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  sessionItems,
  type NewSessionItem,
  type SessionItem,
} from "@/db/schema/sessions";

export interface ISessionItemRepository {
  findById(id: number): Promise<SessionItem | undefined>;
  findActiveBySessionId(sessionId: number): Promise<SessionItem[]>;
  add(data: NewSessionItem): Promise<SessionItem>;
  remove(id: number, removedBy: number): Promise<SessionItem | undefined>;
}

export class SessionItemRepository implements ISessionItemRepository {
  async findById(id: number): Promise<SessionItem | undefined> {
    const [item] = await db.select().from(sessionItems).where(eq(sessionItems.id, id));
    return item;
  }

  async findActiveBySessionId(sessionId: number): Promise<SessionItem[]> {
    return db
      .select()
      .from(sessionItems)
      .where(
        and(
          eq(sessionItems.sessionId, sessionId),
          eq(sessionItems.status, "ACTIVE"),
        ),
      );
  }

  async add(data: NewSessionItem): Promise<SessionItem> {
    const [item] = await db.insert(sessionItems).values(data).returning();
    return item;
  }

  async remove(id: number, removedBy: number): Promise<SessionItem | undefined> {
    const [item] = await db
      .update(sessionItems)
      .set({
        status: "REMOVED",
        removedBy,
        removedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sessionItems.id, id))
      .returning();
    return item;
  }
}

export const sessionItemRepository = new SessionItemRepository();
