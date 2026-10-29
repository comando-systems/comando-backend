import type { Product } from "@/db/schema/products";
import { decimalToCents } from "@/domain/money/money";

export interface PublicProduct {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceCents: decimalToCents(product.price),
    active: product.active,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
