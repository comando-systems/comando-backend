// Product catalog use cases; prices cross the API boundary as integer cents.
import { centsToDecimal } from "@/domain/money";
import {
  requireProduct,
  toPublicProduct,
  type CreateProductInput,
  type IProductRepository,
  type NewProduct,
  type Product,
  type PublicProduct,
  type UpdateProductInput,
} from "@/domain/products";

/** Reads and mutates the product catalog. */
export class ProductService {
  constructor(private readonly products: IProductRepository) {}

  /** Lists products, optionally filtered by active state. */
  async list(options: { active?: boolean } = {}): Promise<PublicProduct[]> {
    const products =
      options.active === undefined
        ? await this.products.findAll()
        : await this.products.findByActive(options.active);

    return products.map(toPublicProduct);
  }

  /** Returns a product or throws PRODUCT_NOT_FOUND. */
  async getById(id: number): Promise<PublicProduct> {
    return this.present(await this.products.findById(id));
  }

  /** Creates a product from validated input. */
  async create(input: CreateProductInput): Promise<PublicProduct> {
    const product = await this.products.create({
      name: input.name,
      description: input.description ?? null,
      price: centsToDecimal(input.priceCents),
    });

    return toPublicProduct(product);
  }

  /** Applies only the provided fields and converts prices to decimal storage. */
  async update(
    id: number,
    input: UpdateProductInput,
  ): Promise<PublicProduct> {
    const data: Partial<NewProduct> = {};

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.description !== undefined) {
      data.description = input.description;
    }

    if (input.priceCents !== undefined) {
      data.price = centsToDecimal(input.priceCents);
    }

    if (input.active !== undefined) {
      data.active = input.active;
    }

    return this.present(await this.products.update(id, data));
  }

  /** Soft-deletes a product by marking it inactive. */
  async deactivate(id: number): Promise<PublicProduct> {
    return this.present(await this.products.deactivate(id));
  }

  private present(product: Product | undefined): PublicProduct {
    return toPublicProduct(requireProduct(product));
  }
}
