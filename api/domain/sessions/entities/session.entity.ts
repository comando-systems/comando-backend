import type { ServiceSession } from "@/db/schema/sessions";

export class ServiceSessionEntity implements ServiceSession {
  id!: number;
  type!: "COUNTER" | "TABLE";
  status!: "OPEN" | "CLOSED" | "CANCELLED";
  tableNumber!: number | null;
  openedBy!: number;
  closedBy!: number | null;
  openedAt!: Date;
  closedAt!: Date | null;
  notes!: string | null;

  static openCounter(openedBy: number, notes?: string): ServiceSessionEntity {
    const entity = new ServiceSessionEntity();
    entity.type = "COUNTER";
    entity.status = "OPEN";
    entity.tableNumber = null;
    entity.openedBy = openedBy;
    entity.closedBy = null;
    entity.openedAt = new Date();
    entity.closedAt = null;
    entity.notes = notes ?? null;
    return entity;
  }

  static openTable(tableNumber: number, openedBy: number, notes?: string): ServiceSessionEntity {
    const entity = new ServiceSessionEntity();
    entity.type = "TABLE";
    entity.status = "OPEN";
    entity.tableNumber = tableNumber;
    entity.openedBy = openedBy;
    entity.closedBy = null;
    entity.openedAt = new Date();
    entity.closedAt = null;
    entity.notes = notes ?? null;
    return entity;
  }

  isOpen(): boolean {
    return this.status === "OPEN";
  }

  close(closedBy: number): void {
    if (!this.isOpen()) throw new Error("Session is not open");
    this.status = "CLOSED";
    this.closedBy = closedBy;
    this.closedAt = new Date();
  }

  cancel(closedBy: number): void {
    if (!this.isOpen()) throw new Error("Session is not open");
    this.status = "CANCELLED";
    this.closedBy = closedBy;
    this.closedAt = new Date();
  }
}
