// Product existence invariant shared by catalog and session flows.
import { NotFoundError } from "@/app/errors";
import type { Product } from ".";

/** Narrows a lookup result to an existing product. */
export function requireProduct(product: Product | undefined): Product {
  if (!product) {
    throw new NotFoundError("Product not found", "PRODUCT_NOT_FOUND");
  }

  return product;
}
