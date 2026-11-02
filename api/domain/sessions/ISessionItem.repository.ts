// Persistence contract for session items, including the audited removal update.
import type { DbExecutor } from "@/db";
import type { NewSessionItem, SessionItem } from ".";

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
