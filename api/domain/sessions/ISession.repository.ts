// Persistence contract for service sessions, including row-lock helpers used
// by close/cancel/add-item flows to serialize concurrent changes.
import type { DbExecutor } from "@/db";
import type { SessionStatus } from "./enums";
import type { NewServiceSession, ServiceSession } from ".";

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
    status?: SessionStatus,
    client?: DbExecutor,
  ): Promise<ServiceSession[]>;
  findAllOpen(client?: DbExecutor): Promise<ServiceSession[]>;
  create(
    data: NewServiceSession,
    client?: DbExecutor,
  ): Promise<ServiceSession>;
  close(
    id: number,
    closedBy: number,
    client?: DbExecutor,
  ): Promise<ServiceSession | undefined>;
  cancel(
    id: number,
    closedBy: number,
    client?: DbExecutor,
  ): Promise<ServiceSession | undefined>;
}
