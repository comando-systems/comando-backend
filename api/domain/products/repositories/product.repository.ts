import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products, type NewProduct, type Product } from "@/db/schema/products";

export interface IProductRepository {
  findById(id: number): Promise<Product | undefined>;
  findAllActive(): Promise<Product[]>;
  findAll(): Promise<Product[]>;
  create(data: NewProduct): Promise<Product>;
  update(id: number, data: Partial<NewProduct>): Promise<Product | undefined>;
  deactivate(id: number): Promise<Product | undefined>;
}

export class ProductRepository implements IProductRepository {
  async findById(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async findAllActive(): Promise<Product[]> {
    return db.select().from(products).where(eq(products.active, true));
  }

  async findAll(): Promise<Product[]> {
    return db.select().from(products);
  }

  async create(data: NewProduct): Promise<Product> {
    const [product] = await db.insert(products).values(data).returning();
    return product;
  }

  async update(id: number, data: Partial<NewProduct>): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async deactivate(id: number): Promise<Product | undefined> {
    return this.update(id, { active: false });
  }
}

export const productRepository = new ProductRepository();
