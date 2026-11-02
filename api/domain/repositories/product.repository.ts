// Bun SQL implementation of the product repository. Deactivation is a soft
// delete so products referenced by historical session items remain available.
import { db, type DbExecutor } from "@/db";
import { requireRow, toNumber } from "@/db/helpers";
import type {
  IProductRepository,
  NewProduct,
  Product,
} from "@/domain/products";

type ProductRow = Omit<Product, "id"> & { id: bigint };

function mapProduct(row: ProductRow): Product {
  return {
    id: toNumber(row.id),
    name: row.name,
    description: row.description,
    price: row.price,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ProductRepository implements IProductRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<Product | undefined> {
    const [row] = await client<ProductRow[]>`
      select * from products where id = ${id}
    `;
    return row ? mapProduct(row) : undefined;
  }

  async findByActive(
    active: boolean,
    client: DbExecutor = db,
  ): Promise<Product[]> {
    const rows = await client<ProductRow[]>`
      select * from products where active = ${active} order by name
    `;
    return rows.map(mapProduct);
  }

  async findAllActive(client: DbExecutor = db): Promise<Product[]> {
    return this.findByActive(true, client);
  }

  async findAll(client: DbExecutor = db): Promise<Product[]> {
    const rows = await client<ProductRow[]>`
      select * from products order by name
    `;
    return rows.map(mapProduct);
  }

  async create(data: NewProduct, client: DbExecutor = db): Promise<Product> {
    const [row] = await client<ProductRow[]>`
      insert into products ${client(data)} returning *
    `;
    return mapProduct(requireRow(row, "Failed to create product"));
  }

  async update(
    id: number,
    data: Partial<NewProduct>,
    client: DbExecutor = db,
  ): Promise<Product | undefined> {
    const [row] = await client<ProductRow[]>`
      update products
      set ${client({ ...data, updatedAt: new Date() })}
      where id = ${id}
      returning *
    `;
    return row ? mapProduct(row) : undefined;
  }

  async deactivate(
    id: number,
    client: DbExecutor = db,
  ): Promise<Product | undefined> {
    return this.update(id, { active: false }, client);
  }
}

export const productRepository = new ProductRepository();
