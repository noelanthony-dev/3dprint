import type {
  ProductBusiness,
  ProductCategory,
  ProductRecord,
} from "@/domain/products";

export interface ProductCategoryUsage {
  readonly category: ProductCategory;
  readonly productCount: number;
}

export interface ProductBusinessUsage {
  readonly business: ProductBusiness;
  readonly productCount: number;
}

export function getProductCategoryUsage(
  categories: readonly ProductCategory[],
  products: readonly Pick<ProductRecord, "category">[],
): readonly ProductCategoryUsage[] {
  const counts = new Map<string, number>();

  products.forEach((product) => {
    const key = product.category.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return categories.map((category) => ({
    category,
    productCount: counts.get(category.toLocaleLowerCase()) ?? 0,
  }));
}

export function getProductBusinessUsage(
  businesses: readonly ProductBusiness[],
  products: readonly Pick<ProductRecord, "businesses">[],
): readonly ProductBusinessUsage[] {
  const counts = new Map<string, number>();

  products.forEach((product) => {
    product.businesses.forEach((business) => {
      const key = business.toLocaleLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return businesses.map((business) => ({
    business,
    productCount: counts.get(business.toLocaleLowerCase()) ?? 0,
  }));
}
