import type { Product } from "@/db/schema/products";

export class ProductEntity implements Product {
  id!: number;
  name!: string;
  description!: string | null;
  price!: string;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static create(
    props: Omit<Product, "id" | "createdAt" | "updatedAt">,
  ): ProductEntity {
    const entity = new ProductEntity();
    Object.assign(entity, props);
    entity.active = props.active ?? true;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();
    return entity;
  }

  getPriceInCents(): number {
    return Math.round(Number(this.price) * 100);
  }

  isActive(): boolean {
    return this.active;
  }
}
