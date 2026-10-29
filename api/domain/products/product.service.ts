import { NotFoundError } from "@/app/errors";
import { centsToDecimal } from "@/domain/money/money";
import type { NewProduct } from "@/db/schema/products";
import type { IProductRepository } from "./repositories/product.repository";
import { toPublicProduct, type PublicProduct } from "./product.presenter";

export interface CreateProductInput {
  name: string;
  description?: string | null;
  priceCents: number;
}

export interface UpdateProductInput {
  name?: string;
  description?: string | null;
  priceCents?: number;
  active?: boolean;
}

export class ProductService {
  constructor(private readonly products: IProductRepository) {}

  async list(options: { active?: boolean } = {}): Promise<PublicProduct[]> {
    const products =
      options.active === undefined
        ? await this.products.findAll()
        : await this.products.findByActive(options.active);

    return products.map(toPublicProduct);
  }

  async getById(id: number): Promise<PublicProduct> {
    const product = await this.products.findById(id);

    if (!product) {
      throw new NotFoundError("Product not found", "PRODUCT_NOT_FOUND");
    }

    return toPublicProduct(product);
  }

  async create(input: CreateProductInput): Promise<PublicProduct> {
    const product = await this.products.create({
      name: input.name,
      description: input.description ?? null,
      price: centsToDecimal(input.priceCents),
    });

    return toPublicProduct(product);
  }

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

    const product = await this.products.update(id, data);

    if (!product) {
      throw new NotFoundError("Product not found", "PRODUCT_NOT_FOUND");
    }

    return toPublicProduct(product);
  }

  async deactivate(id: number): Promise<PublicProduct> {
    const product = await this.products.deactivate(id);

    if (!product) {
      throw new NotFoundError("Product not found", "PRODUCT_NOT_FOUND");
    }

    return toPublicProduct(product);
  }
}
