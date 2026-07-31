import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { Toast, type ToastMessage, type ToastTone } from "@/components/feedback/Toast";
import { Page } from "@/components/layout/Page";
import { Badge, DataTable, MetricPanel, Panel, ToolbarButton } from "@/components/ui";
import { productsRepository } from "@/data/repositories";
import { localSettingsRepository } from "@/data/settings/localSettingsRepository";
import {
  MAX_PRODUCT_CATEGORY_LENGTH,
  isValidProductCategoryName,
  normalizeProductCategories,
  normalizeProductCategoryName,
  type ProductCategory,
  type ProductRecord,
} from "@/domain/products";
import {
  getProductCategoryUsage,
  type ProductCategoryUsage,
} from "./categoryUsage";

export function CategoriesPage() {
  const [categories, setCategories] = useState<readonly ProductCategory[]>(
    () => localSettingsRepository.load().productCategories,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [products, setProducts] = useState<readonly ProductRecord[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((tone: ToastTone, title: string, message: string) => {
    setToast({
      id: Date.now(),
      message,
      title,
      tone,
    });
  }, []);

  async function loadCategories(showFeedback = false): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const loadedProducts = await productsRepository.list();
      const settings = localSettingsRepository.load();
      const loadedCategories = normalizeProductCategories([
        ...settings.productCategories,
        ...loadedProducts.map((product) => product.category),
      ]);

      if (!sameCategories(loadedCategories, settings.productCategories)) {
        localSettingsRepository.save({
          ...settings,
          productCategories: loadedCategories,
        });
      }

      setCategories(loadedCategories);
      setProducts(loadedProducts);

      if (showFeedback) {
        showToast("success", "Categories Refreshed", "Product category usage was reloaded.");
      }
    } catch (loadError) {
      const message = formatError(loadError);
      setError(message);
      if (showFeedback) {
        showToast("danger", "Refresh Failed", message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  const usage = useMemo(
    () => getProductCategoryUsage(categories, products),
    [categories, products],
  );
  const categoriesInUse = usage.filter((item) => item.productCount > 0).length;

  function handleAdd(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const category = normalizeProductCategoryName(name);

    if (!isValidProductCategoryName(category)) {
      showToast(
        "warning",
        "Check Category",
        `Enter a category name up to ${MAX_PRODUCT_CATEGORY_LENGTH} characters.`,
      );
      return;
    }

    if (categories.some((current) => current.localeCompare(category, undefined, { sensitivity: "base" }) === 0)) {
      showToast("warning", "Category Exists", `${category} is already configured.`);
      return;
    }

    setIsSaving(true);

    try {
      const updated = [...categories, category];
      const settings = localSettingsRepository.load();
      const saved = localSettingsRepository.save({
        ...settings,
        productCategories: updated,
      });

      setCategories(saved.productCategories);
      setName("");
      showToast("success", "Category Added", `${category} is now available in Products.`);
    } catch (saveError) {
      showToast("danger", "Save Failed", formatError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete(item: ProductCategoryUsage): void {
    if (item.productCount > 0) {
      showToast(
        "warning",
        "Category In Use",
        `${item.category} is assigned to ${formatProductCount(item.productCount)}.`,
      );
      return;
    }

    if (categories.length <= 1) {
      showToast("warning", "Category Required", "Keep at least one product category.");
      return;
    }

    if (!window.confirm(`Delete the "${item.category}" category?`)) {
      return;
    }

    setIsSaving(true);

    try {
      const updated = categories.filter((category) => category !== item.category);
      const settings = localSettingsRepository.load();
      const saved = localSettingsRepository.save({
        ...settings,
        productCategories: updated,
      });

      setCategories(saved.productCategories);
      showToast("success", "Category Deleted", `${item.category} was removed.`);
    } catch (saveError) {
      showToast("danger", "Delete Failed", formatError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page
      actions={
        <ToolbarButton
          isLoading={isLoading}
          loadingLabel="Refreshing"
          onClick={() => void loadCategories(true)}
        >
          Refresh
        </ToolbarButton>
      }
      description="Add product and design categories whenever you need them. Saved categories appear in the Product form and catalog filter."
      meta={["Local preference", "Included in backups"]}
      title="Product Categories"
    >
      <Toast onDismiss={clearToast} toast={toast} />

      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel detail="available in Products" label="Configured" value={String(categories.length)} />
        <MetricPanel detail="assigned to products" label="In Use" value={String(categoriesInUse)} />
        <MetricPanel detail="across all categories" label="Products" value={String(products.length)} />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Add Category">
          <form className="inventory-form" onSubmit={handleAdd}>
            <label className="form-field" data-wide="true">
              <span>Category Name</span>
              <input
                autoFocus
                maxLength={MAX_PRODUCT_CATEGORY_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Keychains"
                value={name}
              />
            </label>
            <p className="form-message">
              Category names must be unique. You can remove a category only while no products use it.
            </p>
            <div className="form-actions">
              <ToolbarButton
                disabled={!name.trim()}
                isLoading={isSaving}
                loadingLabel="Adding"
                tone="primary"
                type="submit"
              >
                Add Category
              </ToolbarButton>
            </div>
          </form>
        </Panel>

        <Panel title="Configured Categories">
          <DataTable
            columns={["Category", "Usage", "Actions"]}
            columnsTemplate="minmax(180px, 1fr) minmax(120px, 0.55fr) minmax(100px, auto)"
            emptyMessage="No product categories are configured."
            rows={usage.map((item) => [
              <strong key={`${item.category}-name`}>{item.category}</strong>,
              <Badge key={`${item.category}-usage`} tone={item.productCount > 0 ? "success" : "neutral"}>
                {formatProductCount(item.productCount)}
              </Badge>,
              <div className="table-actions" key={`${item.category}-actions`}>
                <button
                  disabled={isSaving || item.productCount > 0 || categories.length <= 1}
                  onClick={() => handleDelete(item)}
                  title={
                    item.productCount > 0
                      ? "Reassign its products before deleting this category."
                      : "Delete category"
                  }
                  type="button"
                >
                  Delete
                </button>
              </div>,
            ] satisfies readonly ReactNode[])}
          />
        </Panel>
      </div>
    </Page>
  );
}

function sameCategories(
  left: readonly ProductCategory[],
  right: readonly ProductCategory[],
): boolean {
  return left.length === right.length && left.every((category, index) => category === right[index]);
}

function formatProductCount(count: number): string {
  return `${count} ${count === 1 ? "product" : "products"}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.toLocaleLowerCase().includes("invoke")) {
    return "Product usage requires the desktop app database. Category settings remain available in this browser preview.";
  }

  return error instanceof Error ? error.message : "Categories could not be loaded.";
}
