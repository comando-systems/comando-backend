// Persistence contract for products; implementations receive an optional
// executor so callers can reuse an existing transaction.
import type { DbExecutor } from "@/db";
import type { NewProduct, Product } from "./types";

export interface IProductRepository {
  findById(id: number, client?: DbExecutor): Promise<Product | undefined>;
  findByActive(active: boolean, client?: DbExecutor): Promise<Product[]>;
  findAllActive(client?: DbExecutor): Promise<Product[]>;
  findAll(client?: DbExecutor): Promise<Product[]>;
  create(data: NewProduct, client?: DbExecutor): Promise<Product>;
  update(
    id: number,
    data: Partial<NewProduct>,
    client?: DbExecutor,
  ): Promise<Product | undefined>;
  deactivate(id: number, client?: DbExecutor): Promise<Product | undefined>;
}
