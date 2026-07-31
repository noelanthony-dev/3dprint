import type { ProductCategory, ProductRecord } from "@/domain/products";

export interface ProductCategoryUsage {
  readonly category: ProductCategory;
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
