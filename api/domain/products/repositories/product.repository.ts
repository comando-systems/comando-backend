import { asc, eq } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { requireRow } from "@/db/helpers";
import { products, type NewProduct, type Product } from "@/db/schema/products";

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

export class ProductRepository implements IProductRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<Product | undefined> {
    const [product] = await client
      .select()
      .from(products)
      .where(eq(products.id, id));
    return product;
  }

  async findByActive(
    active: boolean,
    client: DbExecutor = db,
  ): Promise<Product[]> {
    return client
      .select()
      .from(products)
      .where(eq(products.active, active))
      .orderBy(asc(products.name));
  }

  async findAllActive(client: DbExecutor = db): Promise<Product[]> {
    return this.findByActive(true, client);
  }

  async findAll(client: DbExecutor = db): Promise<Product[]> {
    return client.select().from(products).orderBy(asc(products.name));
  }

  async create(
    data: NewProduct,
    client: DbExecutor = db,
  ): Promise<Product> {
    const [product] = await client.insert(products).values(data).returning();
    return requireRow(product, "Failed to create product");
  }

  async update(
    id: number,
    data: Partial<NewProduct>,
    client: DbExecutor = db,
  ): Promise<Product | undefined> {
    const [product] = await client
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async deactivate(
    id: number,
    client: DbExecutor = db,
  ): Promise<Product | undefined> {
    return this.update(id, { active: false }, client);
  }
}

export const productRepository = new ProductRepository();
