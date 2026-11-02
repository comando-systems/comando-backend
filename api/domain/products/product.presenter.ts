// Maps internal product rows (decimal strings) to the public cents-based shape.
import { decimalToCents } from "@/domain/money";
import type { Product, PublicProduct } from ".";

/** Converts a database row into the API contract without leaking internals. */
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
