// Public barrel for the products domain module. Prices are stored as decimal
// strings and exposed as integer cents.
export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NewProduct = Pick<Product, "name" | "price"> &
  Partial<Pick<Product, "description" | "active" | "createdAt" | "updatedAt">>;

export type PublicProduct = Omit<Product, "price"> & {
  priceCents: number;
};

export type CreateProductInput = Pick<Product, "name"> &
  Partial<Pick<Product, "description">> & {
    priceCents: number;
  };

export type UpdateProductInput = Partial<CreateProductInput> &
  Partial<Pick<Product, "active">>;

export * from "./IProduct.repository";
export * from "./product.presenter";
export * from "./rules";
