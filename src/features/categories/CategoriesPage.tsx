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
  MAX_PRODUCT_BUSINESS_LENGTH,
  MAX_PRODUCT_CATEGORY_LENGTH,
  isValidProductBusinessName,
  isValidProductCategoryName,
  normalizeProductBusinesses,
  normalizeProductBusinessName,
  normalizeProductCategories,
  normalizeProductCategoryName,
  type ProductBusiness,
  type ProductCategory,
  type ProductRecord,
} from "@/domain/products";
import {
  getProductBusinessUsage,
  getProductCategoryUsage,
  type ProductBusinessUsage,
  type ProductCategoryUsage,
} from "./categoryUsage";

export function CategoriesPage() {
  const [businesses, setBusinesses] = useState<readonly ProductBusiness[]>(
    () => localSettingsRepository.load().productBusinesses,
  );
  const [businessName, setBusinessName] = useState("");
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
      const loadedBusinesses = normalizeProductBusinesses([
        ...settings.productBusinesses,
        ...loadedProducts.flatMap((product) => product.businesses),
      ]);
      const loadedCategories = normalizeProductCategories([
        ...settings.productCategories,
        ...loadedProducts.map((product) => product.category),
      ]);

      if (
        !sameStringLists(loadedBusinesses, settings.productBusinesses) ||
        !sameStringLists(loadedCategories, settings.productCategories)
      ) {
        localSettingsRepository.save({
          ...settings,
          productBusinesses: loadedBusinesses,
          productCategories: loadedCategories,
        });
      }

      setBusinesses(loadedBusinesses);
      setCategories(loadedCategories);
      setProducts(loadedProducts);

      if (showFeedback) {
        showToast("success", "Configuration Refreshed", "Category and business usage was reloaded.");
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
  const businessUsage = useMemo(
    () => getProductBusinessUsage(businesses, products),
    [businesses, products],
  );
  const categoriesInUse = usage.filter((item) => item.productCount > 0).length;
  const businessesInUse = businessUsage.filter((item) => item.productCount > 0).length;

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

  function handleAddBusiness(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const business = normalizeProductBusinessName(businessName);

    if (!isValidProductBusinessName(business)) {
      showToast(
        "warning",
        "Check Business",
        `Enter a business name up to ${MAX_PRODUCT_BUSINESS_LENGTH} characters.`,
      );
      return;
    }

    if (businesses.some((current) => current.localeCompare(business, undefined, { sensitivity: "base" }) === 0)) {
      showToast("warning", "Business Exists", `${business} is already configured.`);
      return;
    }

    setIsSaving(true);

    try {
      const settings = localSettingsRepository.load();
      const saved = localSettingsRepository.save({
        ...settings,
        productBusinesses: [...businesses, business],
      });

      setBusinesses(saved.productBusinesses);
      setBusinessName("");
      showToast("success", "Business Added", `${business} is now available in Products.`);
    } catch (saveError) {
      showToast("danger", "Save Failed", formatError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function handleDeleteBusiness(item: ProductBusinessUsage): void {
    if (item.productCount > 0) {
      showToast(
        "warning",
        "Business In Use",
        `${item.business} is assigned to ${formatProductCount(item.productCount)}.`,
      );
      return;
    }

    if (businesses.length <= 1) {
      showToast("warning", "Business Required", "Keep at least one product business.");
      return;
    }

    if (!window.confirm(`Delete the "${item.business}" business?`)) {
      return;
    }

    setIsSaving(true);

    try {
      const settings = localSettingsRepository.load();
      const saved = localSettingsRepository.save({
        ...settings,
        productBusinesses: businesses.filter((business) => business !== item.business),
      });

      setBusinesses(saved.productBusinesses);
      showToast("success", "Business Deleted", `${item.business} was removed.`);
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
      description="Manage the categories and businesses available when creating or editing products."
      meta={["Local preference", "Included in backups"]}
      title="Product Categories & Businesses"
    >
      <Toast onDismiss={clearToast} toast={toast} />

      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel detail="available in Products" label="Categories" value={String(categories.length)} />
        <MetricPanel detail="assigned to products" label="Categories In Use" value={String(categoriesInUse)} />
        <MetricPanel detail="available in Products" label="Businesses" value={String(businesses.length)} />
        <MetricPanel detail="assigned to products" label="Businesses In Use" value={String(businessesInUse)} />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Add Business">
          <form className="inventory-form" onSubmit={handleAddBusiness}>
            <label className="form-field" data-wide="true">
              <span>Business Name</span>
              <input
                maxLength={MAX_PRODUCT_BUSINESS_LENGTH}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="e.g. Weekend Market"
                value={businessName}
              />
            </label>
            <p className="form-message">
              Business names must be unique. You can remove a business only while no products use it.
            </p>
            <div className="form-actions">
              <ToolbarButton
                disabled={!businessName.trim()}
                isLoading={isSaving}
                loadingLabel="Adding"
                tone="primary"
                type="submit"
              >
                Add Business
              </ToolbarButton>
            </div>
          </form>
        </Panel>

        <Panel title="Configured Businesses">
          <DataTable
            columns={["Business", "Usage", "Actions"]}
            columnsTemplate="minmax(0, 1fr) auto auto"
            density="dense"
            emptyMessage="No product businesses are configured."
            minimumWidth="0"
            rows={businessUsage.map((item) => [
              <strong key={`${item.business}-name`}>{item.business}</strong>,
              <Badge key={`${item.business}-usage`} tone={item.productCount > 0 ? "success" : "neutral"}>
                {formatProductCount(item.productCount)}
              </Badge>,
              <div className="table-actions" key={`${item.business}-actions`}>
                <button
                  disabled={isSaving || item.productCount > 0 || businesses.length <= 1}
                  onClick={() => handleDeleteBusiness(item)}
                  title={
                    item.productCount > 0
                      ? "Reassign its products before deleting this business."
                      : "Delete business"
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
            columnsTemplate="minmax(0, 1fr) auto auto"
            density="dense"
            emptyMessage="No product categories are configured."
            minimumWidth="0"
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

function sameStringLists(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((category, index) => category === right[index]);
}

function formatProductCount(count: number): string {
  return `${count} ${count === 1 ? "product" : "products"}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.toLocaleLowerCase().includes("invoke")) {
    return "Product usage requires the desktop app database. Category and business settings remain available in this browser preview.";
  }

  return error instanceof Error ? error.message : "Product configuration could not be loaded.";
}
