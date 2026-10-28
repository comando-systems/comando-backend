import type { SessionItem } from "@/db/schema/sessions";

export class SessionItemEntity implements SessionItem {
  id!: number;
  sessionId!: number;
  productId!: number;
  quantity!: string;
  unitPrice!: string;
  status!: "ACTIVE" | "REMOVED";
  addedBy!: number;
  addedAt!: Date;
  updatedAt!: Date;
  removedAt!: Date | null;
  removedBy!: number | null;

  static add(
    sessionId: number,
    productId: number,
    quantity: number,
    unitPrice: number,
    addedBy: number,
  ): SessionItemEntity {
    const entity = new SessionItemEntity();
    entity.sessionId = sessionId;
    entity.productId = productId;
    entity.quantity = quantity.toString();
    entity.unitPrice = unitPrice.toFixed(2);
    entity.status = "ACTIVE";
    entity.addedBy = addedBy;
    entity.addedAt = new Date();
    entity.updatedAt = new Date();
    entity.removedAt = null;
    entity.removedBy = null;
    return entity;
  }

  remove(removedBy: number): void {
    if (this.status !== "ACTIVE") throw new Error("Item is not active");
    this.status = "REMOVED";
    this.removedBy = removedBy;
    this.removedAt = new Date();
    this.updatedAt = new Date();
  }

  getSubtotalCents(): number {
    return Math.round(Number(this.unitPrice) * Number(this.quantity) * 100);
  }
}
