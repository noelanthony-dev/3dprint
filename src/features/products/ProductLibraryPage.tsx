import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Toast, type ToastMessage, type ToastTone } from "@/components/feedback/Toast";
import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  SearchField,
  SegmentedFilter,
  Swatch,
  ToolbarButton,
} from "@/components/ui";
import { filamentProfilesRepository, filamentRepository, productsRepository, shoppingListRepository } from "@/data/repositories";
import {
  FILAMENT_MATERIALS,
  normalizeHexColor,
  type FilamentProfileRecord,
  type FilamentRecord,
  type FilamentMaterial,
  type SpoolStatus,
} from "@/domain/inventory";
import {
  COMMERCIAL_LICENSE_STATUSES,
  LICENSE_BILLING_INTERVALS,
  PRODUCT_CATEGORIES,
  PRODUCT_BUSINESSES,
  PRODUCT_SALE_UNITS,
  getLicensePaymentDisplay,
  getLicenseWarningDisplay,
  getFilamentProfileInputsFromProductInput,
  validateProductInput,
  type CommercialLicenseStatus,
  type ProductFilamentMode,
  type LicenseBillingInterval,
  type ProductCategory,
  type ProductBusiness,
  type ProductInput,
  type ProductHueForgeFilament,
  type ProductRecord,
  type ProductSaleUnit,
} from "@/domain/products";

export type FilterValue = "all" | "warning" | "with-image" | "no-image";
export type ExistingColorsFilterValue = "all" | "ready" | "needs";
export type ProductSortKey = "default" | "design" | "author";

export interface ProductCatalogFilters {
  readonly authorFilter: string;
  readonly categoryFilter: "all" | ProductCategory;
  readonly colorsFilter: ExistingColorsFilterValue;
  readonly filter: FilterValue;
  readonly search: string;
  readonly sortKey: ProductSortKey;
}

interface ProductTableHeaderOption {
  readonly label: string;
  readonly value: string;
}

export interface ProductNavigationState {
  readonly count: number;
  readonly currentIndex: number;
  readonly nextProduct: ProductRecord;
  readonly previousProduct: ProductRecord;
}

interface ProductFormState {
  readonly authorName: string;
  readonly businesses: readonly ProductBusiness[];
  readonly canPrintWithInventory: boolean;
  readonly category: ProductCategory;
  readonly commercialLicenseStatus: CommercialLicenseStatus;
  readonly designName: string;
  readonly estimatedPrintHours: string;
  readonly imageReference: string;
  readonly licenseBillingInterval: LicenseBillingInterval;
  readonly licenseCostAmount: string;
  readonly filamentMode: ProductFilamentMode;
  readonly hueForgeFilaments: readonly ProductHueForgeFilamentForm[];
  readonly notes: string;
  readonly saleUnit: ProductSaleUnit;
  readonly sourceLink: string;
}

interface ProductHueForgeFilamentForm {
  readonly alternativeFilamentIds: readonly number[];
  readonly brand: string;
  readonly colorName: string;
  readonly hexColor: string;
  readonly layerRange: string;
  readonly materialType: FilamentMaterial;
  readonly purchaseSource: string;
  readonly requiredGrams: string;
  readonly role: string;
  readonly transmissionDistance: string;
}

const emptyForm: ProductFormState = {
  authorName: "",
  businesses: [],
  canPrintWithInventory: false,
  category: "Bookmarks",
  commercialLicenseStatus: "unknown",
  designName: "",
  estimatedPrintHours: "",
  imageReference: "",
  licenseBillingInterval: "none",
  licenseCostAmount: "0",
  filamentMode: "hueforge",
  hueForgeFilaments: [],
  notes: "",
  saleUnit: "piece",
  sourceLink: "",
};

const emptyHueForgeFilament: ProductHueForgeFilamentForm = {
  alternativeFilamentIds: [],
  brand: "",
  colorName: "",
  hexColor: "",
  layerRange: "",
  materialType: "PLA",
  purchaseSource: "",
  requiredGrams: "0",
  role: "",
  transmissionDistance: "",
};

const categoryTone: Partial<Record<ProductCategory, "accent" | "success" | "warning">> = {
  Bookmarks: "success",
  Clickers: "warning",
  "Figure/Miniatures": "warning",
  Magnets: "accent",
  Others: "accent",
};

export function ProductLibraryPage() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [duplicateSourceName, setDuplicateSourceName] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isShoppingItemSaving, setIsShoppingItemSaving] = useState(false);
  const [filamentProfiles, setFilamentProfiles] = useState<FilamentProfileRecord[]>([]);
  const [filaments, setFilaments] = useState<FilamentRecord[]>([]);
  const [authorFilter, setAuthorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ProductCategory>("all");
  const [colorsFilter, setColorsFilter] = useState<ExistingColorsFilterValue>("all");
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<ProductSortKey>("default");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

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

  async function loadProducts(showFeedback = false): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [loaded, loadedProfiles, loadedFilaments] = await Promise.all([
        productsRepository.list(),
        filamentProfilesRepository.list(),
        filamentRepository.list(),
      ]);
      setProducts(loaded);
      setFilamentProfiles(loadedProfiles);
      setFilaments(loadedFilaments);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
      if (showFeedback) {
        showToast("success", "Products Refreshed", "Local product records were reloaded.");
      }
    } catch (loadError) {
      const message = formatRepositoryError(loadError);
      setError(message);
      if (showFeedback) {
        showToast("danger", "Refresh Failed", message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  const selectedProduct = products.find((product) => product.id === selectedId) ?? products[0] ?? null;

  const filteredProducts = useMemo(
    () =>
      filterProductsForCatalog(products, {
        authorFilter,
        categoryFilter,
        colorsFilter,
        filter,
        search,
        sortKey,
      }),
    [authorFilter, categoryFilter, colorsFilter, filter, products, search, sortKey],
  );
  const authorFilterOptions = useMemo(
    () => getProductAuthorFilterOptions(products),
    [products],
  );
  const productNavigation = useMemo(
    () => getProductNavigationState(editingId, filteredProducts, products),
    [editingId, filteredProducts, products],
  );
  const detailNavigation = useMemo(
    () => getProductNavigationState(selectedProduct?.id ?? null, filteredProducts, products),
    [filteredProducts, products, selectedProduct],
  );
  const selectedRowIndex = useMemo(
    () => filteredProducts.findIndex((product) => product.id === selectedProduct?.id),
    [filteredProducts, selectedProduct],
  );

  const warningCount = products.filter((product) =>
    getLicenseWarningDisplay(product.commercialLicenseStatus).shouldWarn,
  ).length;
  const imageCount = products.filter((product) => product.imageReference.trim().length > 0).length;
  const hueForgeCount = products.filter((product) => getHueForgeSpecCount(product) > 0).length;

  function startCreate(): void {
    setEditingId(null);
    setDuplicateSourceName(null);
    setForm(emptyForm);
    setValidationMessage(null);
    setIsFormOpen(true);
  }

  function startEdit(product: ProductRecord): void {
    setEditingId(product.id);
    setDuplicateSourceName(null);
    setSelectedId(product.id);
    setIsDetailModalOpen(false);
    setForm(toFormState(product));
    setValidationMessage(null);
    setIsFormOpen(true);
  }

  function startDuplicate(product: ProductRecord): void {
    setEditingId(null);
    setDuplicateSourceName(product.designName);
    setSelectedId(product.id);
    setIsDetailModalOpen(false);
    setForm({
      ...toFormState(product),
      designName: getDuplicateDesignName(product.designName, products),
    });
    setValidationMessage(null);
    setIsFormOpen(true);
  }

  function openProductDetail(product: ProductRecord): void {
    setSelectedId(product.id);
    setIsDetailModalOpen(true);
  }

  function closeProductDetail(): void {
    setIsDetailModalOpen(false);
  }

  function navigateProductDetail(product: ProductRecord): void {
    setSelectedId(product.id);
  }

  function navigateEditingProduct(product: ProductRecord): void {
    if (isSaving) {
      return;
    }

    startEdit(product);
  }

  function closeForm(): void {
    if (isSaving) {
      return;
    }

    setIsFormOpen(false);
    setDuplicateSourceName(null);
    setValidationMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    const input = toProductInput(form);
    const validation = validateProductInput(input);
    const isDuplicate = editingId == null && duplicateSourceName != null;

    if (!validation.valid) {
      const message = Object.values(validation.errors)[0] ?? "Check the product fields.";
      setValidationMessage(message);
      showToast("warning", "Check Product", message);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const saved =
        editingId == null
          ? await productsRepository.create(input)
          : await productsRepository.update(editingId, input);
      const loaded = await productsRepository.list();
      let profilesUpdated = true;

      try {
        if (input.filamentMode === "hueforge") {
          await filamentProfilesRepository.upsertMany(
            getFilamentProfileInputsFromProductInput(input),
          );
          setFilamentProfiles(await filamentProfilesRepository.list());
        }
      } catch (profileError) {
        profilesUpdated = false;
        showToast(
          "warning",
          "Product Saved",
          `Saved ${saved.designName}, but filament profiles were not updated: ${formatRepositoryError(profileError)}`,
        );
      }

      setProducts(loaded);
      setSelectedId(saved.id);
      setEditingId(saved.id);
      setDuplicateSourceName(null);
      setForm(toFormState(saved));
      setIsFormOpen(false);
      if (profilesUpdated) {
        showToast(
          "success",
          isDuplicate
            ? "Product Duplicated"
            : editingId == null
              ? "Product Saved"
              : "Product Updated",
          isDuplicate
            ? `${saved.designName} was created from ${duplicateSourceName}.`
            : `${saved.designName} was saved locally.`,
        );
      }
    } catch (saveError) {
      const message = formatRepositoryError(saveError);
      setError(message);
      showToast("danger", "Save Failed", message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProduct(product: ProductRecord): Promise<void> {
    const shouldDelete = window.confirm(
      `Delete "${product.designName}" (${formatProductId(product.id)})?`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await productsRepository.delete(product.id);
      const loaded = await productsRepository.list();

      setProducts(loaded);
      setSelectedId((current) => {
        if (current !== product.id) {
          return current;
        }

        return loaded[0]?.id ?? null;
      });
      if (editingId === product.id) {
        setEditingId(null);
        setForm(emptyForm);
        setIsFormOpen(false);
      }
      if (selectedId === product.id) {
        setIsDetailModalOpen(false);
      }
      showToast("success", "Product Deleted", `${product.designName} was removed.`);
    } catch (deleteError) {
      const message = formatRepositoryError(deleteError);
      setError(message);
      showToast("danger", "Delete Failed", message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function addFilamentToShoppingList(product: ProductRecord, filament: ProductHueForgeFilament): Promise<void> {
    setIsShoppingItemSaving(true);

    try {
      const itemName = formatShoppingFilamentName(product, filament);
      await shoppingListRepository.create({
        category: "Filament",
        itemName,
        notes: `For ${product.designName}.`,
        priority: "normal",
        productId: product.id,
        productIds: [product.id],
        quantityNeeded: Math.max(1, filament.requiredGrams),
        requiredTransmissionDistance: filament.transmissionDistance,
        shopeeListingName: "",
        sourceNote: `${product.designName}${filament.role ? `, ${filament.role}` : ""}${filament.layerRange ? `, ${filament.layerRange}` : ""}.`,
        sourceType: "manual",
        status: "open",
        unit: "grams",
      });

      showToast("success", "Shopping Item Added", `${itemName} was added for ${product.designName}.`);
    } catch (shoppingError) {
      showToast("danger", "Shopping Item Failed", formatRepositoryError(shoppingError));
    } finally {
      setIsShoppingItemSaving(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton
            isLoading={isLoading}
            loadingLabel="Refreshing"
            onClick={() => void loadProducts(true)}
          >
            Refresh
          </ToolbarButton>
          <ToolbarButton onClick={startCreate} tone="primary">
            Add Product
          </ToolbarButton>
        </>
      }
      description="Products, source links, authors, sale units, license warnings, notes, and one optional image reference for future workflows."
      meta={[]}
      title="Design Library"
    >
      <Toast onDismiss={clearToast} toast={toast} />

      {error && products.length === 0 ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="screen-toolbar">
        <SearchField
          label="Design search"
          onChange={setSearch}
          placeholder="Search design library..."
          value={search}
        />
        <SegmentedFilter
          label="Design filters"
          onChange={(value) => setFilter(value as FilterValue)}
          options={[
            { active: filter === "all", label: "All", value: "all" },
            { active: filter === "warning", label: "License Flags", value: "warning" },
            { active: filter === "with-image", label: "With Image", value: "with-image" },
            { active: filter === "no-image", label: "No Image", value: "no-image" },
          ]}
        />
      </div>

      <div className="metric-grid">
        <MetricPanel detail="local records" label="Designs" value={String(products.length)} />
        <MetricPanel detail="need review" label="License Flags" tone="warning" value={String(warningCount)} />
        <MetricPanel detail="reference only" label="Images" value={String(imageCount)} />
        <MetricPanel detail="with color specs" label="HueForge" tone="success" value={String(hueForgeCount)} />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Product Catalog">
          <DataTable
            columns={[
              "Img",
              {
                key: "design",
                header: (
                  <ProductTableHeaderButton
                    active={sortKey === "design"}
                    label="Design"
                    onClick={() => setSortKey("design")}
                  />
                ),
              },
              {
                key: "category",
                header: (
                  <ProductTableHeaderSelect
                    label="Category"
                    onChange={(value) => setCategoryFilter(value as "all" | ProductCategory)}
                    options={[
                      { label: "All", value: "all" },
                      ...PRODUCT_CATEGORIES.map((category) => ({
                        label: category,
                        value: category,
                      })),
                    ]}
                    value={categoryFilter}
                  />
                ),
              },
              {
                key: "author",
                header: (
                  <ProductTableHeaderSelect
                    actionActive={sortKey === "author"}
                    actionLabel="Sort author"
                    label="Author"
                    onAction={() => setSortKey("author")}
                    onChange={setAuthorFilter}
                    options={[
                      { label: "All", value: "all" },
                      ...authorFilterOptions.map((author) => ({
                        label: author,
                        value: author,
                      })),
                    ]}
                    value={authorFilter}
                  />
                ),
              },
              {
                key: "print-hours",
                header: <span className="product-table-header__label">Print Hours</span>,
              },
              {
                key: "existing-colors",
                header: (
                  <ProductTableHeaderSelect
                    label="Colors"
                    onChange={(value) => setColorsFilter(value as ExistingColorsFilterValue)}
                    options={[
                      { label: "All", value: "all" },
                      { label: "Ready", value: "ready" },
                      { label: "Needs", value: "needs" },
                    ]}
                    value={colorsFilter}
                  />
                ),
              },
            ]}
            columnsTemplate="52px minmax(230px, 1.65fr) minmax(112px, 0.72fr) minmax(104px, 0.68fr) minmax(88px, 0.5fr) minmax(92px, 0.52fr)"
            density="dense"
            footer={
              isLoading
                ? "Loading local SQLite records..."
                : `${filteredProducts.length} visible of ${products.length} product records.`
            }
            onRowClick={(rowIndex) => {
              const product = filteredProducts[rowIndex];
              if (product) {
                openProductDetail(product);
              }
            }}
            rows={filteredProducts.map((product) => {
              const currentCategoryTone = categoryTone[product.category];

              return [
                <ProductThumb product={product} />,
                <span className="row-title">
                  <strong>{product.designName}</strong>
                </span>,
                <Badge {...(currentCategoryTone ? { tone: currentCategoryTone } : {})}>
                  {product.category}
                </Badge>,
                product.authorName,
                formatCompactPrintHours(product.estimatedPrintHours),
                <InventoryReadyIndicator canPrintWithInventory={product.canPrintWithInventory} />,
              ];
            })}
            selectedRowIndex={selectedRowIndex >= 0 ? selectedRowIndex : null}
          />
        </Panel>

        <div className="side-stack">
          <Panel title="Product Detail">
            {selectedProduct ? (
                <ProductDetail
                  filaments={filaments}
                  isDeleting={isDeleting}
                  isShoppingItemSaving={isShoppingItemSaving}
                  onAddFilamentToShoppingList={(filament) => void addFilamentToShoppingList(selectedProduct, filament)}
                  onDelete={() => void deleteProduct(selectedProduct)}
                  onDuplicate={() => startDuplicate(selectedProduct)}
                  onEdit={() => startEdit(selectedProduct)}
                  product={selectedProduct}
              />
            ) : (
              <div className="empty-state">
                <Badge>Empty</Badge>
                <p>Add a design or product record to start building the library.</p>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {isDetailModalOpen && selectedProduct ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="product-detail-modal-title"
            aria-modal="true"
            className="modal modal--product-snapshot"
            role="dialog"
          >
            <header className="modal__header">
              <div className="modal__title-row">
                {detailNavigation ? (
                  <button
                    aria-label="Previous product"
                    className="modal__nav-button"
                    disabled={isDeleting || detailNavigation.count <= 1}
                    onClick={() => navigateProductDetail(detailNavigation.previousProduct)}
                    type="button"
                  >
                    ‹
                  </button>
                ) : null}
                <div className="modal__title-stack">
                  <h2 id="product-detail-modal-title">Product Details</h2>
                  <span className="modal__position">
                    {formatProductId(selectedProduct.id)}
                    {detailNavigation
                      ? ` · ${detailNavigation.currentIndex + 1} / ${detailNavigation.count}`
                      : ""}
                  </span>
                </div>
                {detailNavigation ? (
                  <button
                    aria-label="Next product"
                    className="modal__nav-button"
                    disabled={isDeleting || detailNavigation.count <= 1}
                    onClick={() => navigateProductDetail(detailNavigation.nextProduct)}
                    type="button"
                  >
                    ›
                  </button>
                ) : null}
              </div>
              <button
                aria-label="Close product details"
                className="modal__close-button"
                onClick={closeProductDetail}
                type="button"
              >
                x
              </button>
            </header>
            <div className="modal__body">
              <ProductSnapshot
                filaments={filaments}
                isDeleting={isDeleting}
                onDelete={() => void deleteProduct(selectedProduct)}
                onDuplicate={() => startDuplicate(selectedProduct)}
                onEdit={() => startEdit(selectedProduct)}
                product={selectedProduct}
              />
            </div>
          </section>
        </div>
      ) : null}

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="product-form-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <header className="modal__header">
              <div className="modal__title-row">
                {productNavigation ? (
                  <button
                    aria-label="Previous product"
                    className="modal__nav-button"
                    disabled={isSaving || productNavigation.count <= 1}
                    onClick={() => navigateEditingProduct(productNavigation.previousProduct)}
                    type="button"
                  >
                    ‹
                  </button>
                ) : null}
                <div className="modal__title-stack">
                  <h2 id="product-form-title">
                    {editingId == null
                      ? duplicateSourceName
                        ? "Duplicate Product"
                        : "Add Product"
                      : "Edit Product"}
                  </h2>
                  {productNavigation ? (
                    <span className="modal__position">
                      {productNavigation.currentIndex + 1} / {productNavigation.count}
                    </span>
                  ) : null}
                </div>
                {productNavigation ? (
                  <button
                    aria-label="Next product"
                    className="modal__nav-button"
                    disabled={isSaving || productNavigation.count <= 1}
                    onClick={() => navigateEditingProduct(productNavigation.nextProduct)}
                    type="button"
                  >
                    ›
                  </button>
                ) : null}
              </div>
              <button
                aria-label="Close product form"
                className="modal__close-button"
                disabled={isSaving}
                onClick={closeForm}
                type="button"
              >
                x
              </button>
            </header>
            <form className="inventory-form modal__body" onSubmit={(event) => void handleSubmit(event)}>
              <ProductFormFields
                filaments={filaments}
                filamentProfiles={filamentProfiles}
                form={form}
                setForm={setForm}
              />
              {validationMessage ? (
                <div className="form-message" role="alert">
                  {validationMessage}
                </div>
              ) : null}
              <div className="form-actions">
                <ToolbarButton disabled={isSaving} onClick={startCreate}>
                  Clear
                </ToolbarButton>
                <ToolbarButton disabled={isSaving} onClick={closeForm}>
                  Cancel
                </ToolbarButton>
                <ToolbarButton
                  isLoading={isSaving}
                  loadingLabel={editingId == null ? "Saving" : "Updating"}
                  tone="primary"
                  type="submit"
                >
                  {editingId == null
                    ? duplicateSourceName
                      ? "Save Duplicate"
                      : "Save Product"
                    : "Update Product"}
                </ToolbarButton>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </Page>
  );
}

function ProductDetail({
  filaments,
  isDeleting,
  isShoppingItemSaving,
  onAddFilamentToShoppingList,
  onDelete,
  onDuplicate,
  product,
  onEdit,
}: {
  readonly filaments: readonly FilamentRecord[];
  readonly isDeleting: boolean;
  readonly isShoppingItemSaving: boolean;
  readonly onAddFilamentToShoppingList: (filament: ProductHueForgeFilament) => void;
  readonly onDelete: () => void;
  readonly onDuplicate: () => void;
  readonly product: ProductRecord;
  readonly onEdit: () => void;
}) {
  const license = getLicenseWarningDisplay(product.commercialLicenseStatus);
  const payment = getLicensePaymentDisplay(
    product.licenseCostAmount,
    product.licenseBillingInterval,
  );
  const currentCategoryTone = categoryTone[product.category];

  return (
    <div className="detail-stack">
      <div className="product-detail-preview">
        {isRenderableImageReference(product.imageReference) ? (
          <img alt={product.designName} src={product.imageReference} />
        ) : (
          <span className="product-detail-preview__fallback">IMAGE REF</span>
        )}
      </div>
      <div className="spool-card-head">
        <span className="spool-card-head__image">PD</span>
        <div>
          <div className="spool-card-head__badges">
            <Badge {...(currentCategoryTone ? { tone: currentCategoryTone } : {})}>
              {product.category}
            </Badge>
            <InventoryReadyBadge canPrintWithInventory={product.canPrintWithInventory} />
            <Badge tone={license.tone}>{license.label}</Badge>
          </div>
          <strong>{product.designName}</strong>
          <span>ID: {formatProductId(product.id)}</span>
        </div>
      </div>
      {license.shouldWarn ? (
        <div className="license-warning">
          <Badge tone={license.tone}>Commercial License Warning</Badge>
          <p>{license.message}</p>
        </div>
      ) : (
        <div className="callout">
          <Badge tone="success">Commercial License</Badge>
          <p>{license.message}</p>
        </div>
      )}
      <div className="key-value-list">
        <span>Author</span>
        <strong>{product.authorName}</strong>
        <span>Sale Unit</span>
        <strong>{product.saleUnit}</strong>
        <span>Print Hours</span>
        <strong>{formatEstimatedPrintHours(product.estimatedPrintHours)}</strong>
        <span>Businesses</span>
        <strong>{product.businesses.join(", ") || "--"}</strong>
        <span>Existing Colors</span>
        <strong>{product.canPrintWithInventory ? "Ready to print" : "Needs filament colors"}</strong>
        <span>Source</span>
        <strong>{product.sourceLink}</strong>
        <span>Image Ref</span>
        <strong>{product.imageReference || "--"}</strong>
        <span>License Cost</span>
        <strong>{payment.label}</strong>
      </div>
      <ProductHueForgeFilamentList
        filaments={product.hueForgeFilaments}
        inventoryFilaments={filaments}
        isShoppingItemSaving={isShoppingItemSaving}
        mode={product.filamentMode}
        onAddToShoppingList={onAddFilamentToShoppingList}
      />
      <div className="callout">
        <Badge>Notes</Badge>
        <p>{product.notes || "No product notes saved."}</p>
      </div>
      <div className="form-actions">
        <ToolbarButton
          isLoading={isDeleting}
          loadingLabel="Deleting"
          onClick={onDelete}
          tone="danger"
        >
          Delete Selected
        </ToolbarButton>
        <ToolbarButton onClick={onDuplicate}>
          Duplicate Selected
        </ToolbarButton>
        <ToolbarButton onClick={onEdit} tone="primary">
          Edit Selected
        </ToolbarButton>
      </div>
    </div>
  );
}

function ProductSnapshot({
  filaments,
  isDeleting,
  onDelete,
  onDuplicate,
  onEdit,
  product,
}: {
  readonly filaments: readonly FilamentRecord[];
  readonly isDeleting: boolean;
  readonly onDelete: () => void;
  readonly onDuplicate: () => void;
  readonly onEdit: () => void;
  readonly product: ProductRecord;
}) {
  const license = getLicenseWarningDisplay(product.commercialLicenseStatus);
  const payment = getLicensePaymentDisplay(
    product.licenseCostAmount,
    product.licenseBillingInterval,
  );
  const currentCategoryTone = categoryTone[product.category];
  const colorCount = getHueForgeSpecCount(product);

  return (
    <div className="product-snapshot">
      <div className="product-snapshot__hero">
        <div className="product-snapshot__image">
          {isRenderableImageReference(product.imageReference) ? (
            <img alt={product.designName} src={product.imageReference} />
          ) : (
            <span>{product.imageReference ? "IMAGE REF" : "NO IMAGE"}</span>
          )}
        </div>
        <div className="product-snapshot__summary">
          <div className="spool-card-head__badges">
            <Badge {...(currentCategoryTone ? { tone: currentCategoryTone } : {})}>
              {product.category}
            </Badge>
            <InventoryReadyBadge canPrintWithInventory={product.canPrintWithInventory} />
            <Badge tone={license.tone}>{license.label}</Badge>
          </div>
          <div>
            <strong>{product.designName}</strong>
            <span>{product.sourceLink || "No source link saved."}</span>
          </div>
          <div className="product-snapshot__metrics">
            <span>
              <small>Author</small>
              <strong>{product.authorName || "--"}</strong>
            </span>
            <span>
              <small>Sale Unit</small>
              <strong>{product.saleUnit}</strong>
            </span>
            <span>
              <small>Print Hours</small>
              <strong>{formatEstimatedPrintHours(product.estimatedPrintHours)}</strong>
            </span>
            <span>
              <small>Businesses</small>
              <strong>{product.businesses.join(", ") || "--"}</strong>
            </span>
            <span>
              <small>Colors</small>
              <strong>{colorCount}</strong>
            </span>
            <span>
              <small>License Cost</small>
              <strong>{payment.label}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="product-snapshot__grid">
        <div className="product-snapshot__panel">
          <div className="product-snapshot__panel-head">
            <span>Color Specs</span>
            <Badge>{product.filamentMode === "basic" ? "Basic" : "HueForge"}</Badge>
          </div>
          <ProductSnapshotFilaments
            filaments={product.hueForgeFilaments}
            inventoryFilaments={filaments}
            mode={product.filamentMode}
          />
        </div>
        <div className="product-snapshot__panel">
          <div className="product-snapshot__panel-head">
            <span>Notes</span>
          </div>
          <p>{product.notes || "No product notes saved."}</p>
          <dl className="product-snapshot__facts">
            <div>
              <dt>Image Ref</dt>
              <dd>{product.imageReference || "--"}</dd>
            </div>
            <div>
              <dt>Existing Colors</dt>
              <dd>{product.canPrintWithInventory ? "Ready to print" : "Needs filament colors"}</dd>
            </div>
            <div>
              <dt>Commercial Use</dt>
              <dd>{license.message}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="form-actions product-snapshot__actions">
        <ToolbarButton
          isLoading={isDeleting}
          loadingLabel="Deleting"
          onClick={onDelete}
          tone="danger"
        >
          Delete
        </ToolbarButton>
        <ToolbarButton onClick={onDuplicate}>
          Duplicate
        </ToolbarButton>
        <ToolbarButton onClick={onEdit} tone="primary">
          Edit Product
        </ToolbarButton>
      </div>
    </div>
  );
}

function ProductSnapshotFilaments({
  filaments,
  inventoryFilaments,
  mode,
}: {
  readonly filaments: readonly ProductHueForgeFilament[];
  readonly inventoryFilaments: readonly FilamentRecord[];
  readonly mode: ProductFilamentMode;
}) {
  if (filaments.length === 0) {
    return <p className="product-snapshot__empty">No filament color specs saved.</p>;
  }

  return (
    <div className="product-snapshot-filaments">
      {filaments.map((filament, index) => {
        const alternativeLabels = formatAlternativeFilamentLabels(
          filament.alternativeFilamentIds,
          inventoryFilaments,
        );
        const key = `${filament.brand}-${filament.colorName}-${index}`;

        if (mode === "basic") {
          return (
            <div className="product-snapshot-filaments__item" key={key}>
              <Badge>Filament {index + 1}</Badge>
              <strong>{filament.requiredGrams > 0 ? `${filament.requiredGrams}g` : "0g"}</strong>
            </div>
          );
        }

        return (
          <div
            className="product-snapshot-filaments__item product-snapshot-filaments__item--colorized"
            key={key}
            style={getFilamentRowColorStyle(filament.hexColor)}
          >
            {isHexColor(filament.hexColor) ? (
              <Swatch color={normalizeHexColor(filament.hexColor)} label={filament.colorName} />
            ) : (
              <Badge>{filament.colorName || "Color"}</Badge>
            )}
            <div>
              <strong>
                {filament.brand || "--"} {filament.materialType} {filament.colorName || ""}
              </strong>
              <span>
                {filament.transmissionDistance == null
                  ? "TD --"
                  : `TD ${filament.transmissionDistance.toFixed(1)}`}
                {filament.requiredGrams > 0 ? ` / ${filament.requiredGrams}g` : ""}
                {filament.role ? ` / ${filament.role}` : ""}
              </span>
              {alternativeLabels.length > 0 ? (
                <small>Alternatives: {alternativeLabels.join(", ")}</small>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductHueForgeFilamentList({
  filaments,
  inventoryFilaments,
  isShoppingItemSaving,
  mode,
  onAddToShoppingList,
}: {
  readonly filaments: readonly ProductHueForgeFilament[];
  readonly inventoryFilaments: readonly FilamentRecord[];
  readonly isShoppingItemSaving: boolean;
  readonly mode: ProductFilamentMode;
  readonly onAddToShoppingList: (filament: ProductHueForgeFilament) => void;
}) {
  if (filaments.length === 0) {
    return (
      <div className="callout">
        <Badge>Filaments</Badge>
        <p>No filament color specs saved for this product.</p>
      </div>
    );
  }

  if (mode === "basic") {
    return (
      <div className="product-filament-list">
        {filaments.map((filament, index) => (
          <div className="product-filament-list__item" key={`basic-filament-${index}`}>
            <Badge>Filament</Badge>
            <strong>Filament {index + 1}</strong>
            <span>{filament.requiredGrams > 0 ? `${filament.requiredGrams}g` : "0g"}</span>
            <ToolbarButton
              disabled={isShoppingItemSaving}
              onClick={() => onAddToShoppingList(filament)}
              tone="primary"
            >
              Add to Shopping List
            </ToolbarButton>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="product-filament-list">
      {filaments.map((filament, index) => {
        const alternativeLabels = formatAlternativeFilamentLabels(
          filament.alternativeFilamentIds,
          inventoryFilaments,
        );

        return (
          <div
            className="product-filament-list__item product-filament-list__item--colorized"
            key={`${filament.brand}-${filament.colorName}-${index}`}
            style={getFilamentRowColorStyle(filament.hexColor)}
          >
            {isHexColor(filament.hexColor) ? (
              <Swatch color={normalizeHexColor(filament.hexColor)} label={filament.colorName} />
            ) : (
              <Badge>{filament.colorName}</Badge>
            )}
            <strong>
              {filament.materialType} {filament.brand}
            </strong>
            <span>
              {filament.transmissionDistance == null
                ? "TD --"
                : `TD ${filament.transmissionDistance.toFixed(1)}`}
              {filament.requiredGrams > 0 ? ` / ${filament.requiredGrams}g` : ""}
            </span>
            {alternativeLabels.length > 0 ? (
              <small>Alternatives: {alternativeLabels.join(", ")}</small>
            ) : null}
            <ToolbarButton
              disabled={isShoppingItemSaving}
              onClick={() => onAddToShoppingList(filament)}
              tone="primary"
            >
              Add to Shopping List
            </ToolbarButton>
          </div>
        );
      })}
    </div>
  );
}

function ProductThumb({ product }: { readonly product: ProductRecord }) {
  if (isRenderableImageReference(product.imageReference)) {
    return (
      <span className="product-thumb">
        <img alt="" src={product.imageReference} />
      </span>
    );
  }

  return (
    <span className="product-thumb product-thumb--empty">
      {product.imageReference ? "REF" : "IMG"}
    </span>
  );
}

function InventoryReadyBadge({
  canPrintWithInventory,
}: {
  readonly canPrintWithInventory: boolean;
}) {
  return canPrintWithInventory ? (
    <Badge tone="success">Colors Ready</Badge>
  ) : (
    <Badge tone="warning">Needs Colors</Badge>
  );
}

function InventoryReadyIndicator({
  canPrintWithInventory,
}: {
  readonly canPrintWithInventory: boolean;
}) {
  const label = canPrintWithInventory ? "Colors ready" : "Needs colors";

  return (
    <span
      aria-label={label}
      className="inventory-ready-indicator"
      data-ready={canPrintWithInventory ? "true" : "false"}
      role="img"
      title={label}
    >
      {canPrintWithInventory ? "✓" : "×"}
    </span>
  );
}

function ProductTableHeaderButton({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      className="product-table-header__button"
      data-active={active ? "true" : "false"}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <strong>A-Z</strong>
    </button>
  );
}

function ProductTableHeaderSelect({
  actionActive = false,
  actionLabel,
  label,
  onAction,
  onChange,
  options,
  value,
}: {
  readonly actionActive?: boolean;
  readonly actionLabel?: string;
  readonly label: string;
  readonly onAction?: () => void;
  readonly onChange: (value: string) => void;
  readonly options: readonly ProductTableHeaderOption[];
  readonly value: string;
}) {
  return (
    <span className="product-table-header">
      {onAction ? (
        <button
          aria-label={actionLabel ?? `Sort ${label}`}
          className="product-table-header__button"
          data-active={actionActive ? "true" : "false"}
          onClick={onAction}
          type="button"
        >
          <span>{label}</span>
          <strong>A-Z</strong>
        </button>
      ) : (
        <span className="product-table-header__label">{label}</span>
      )}
      <select
        aria-label={`${label} filter`}
        className="product-table-header__select"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function filterProductsForCatalog(
  products: readonly ProductRecord[],
  filters: ProductCatalogFilters,
): readonly ProductRecord[] {
  const query = filters.search.trim().toLowerCase();

  const filtered = products.filter((product) => {
    const license = getLicenseWarningDisplay(product.commercialLicenseStatus);
    const hasImage = product.imageReference.trim().length > 0;
    const matchesFilter =
      filters.filter === "all" ||
      (filters.filter === "warning"
        ? license.shouldWarn
        : filters.filter === "with-image"
          ? hasImage
          : !hasImage);
    const matchesAuthor =
      filters.authorFilter === "all" || product.authorName === filters.authorFilter;
    const matchesCategory =
      filters.categoryFilter === "all" || product.category === filters.categoryFilter;
    const matchesColors =
      filters.colorsFilter === "all" ||
      (filters.colorsFilter === "ready"
        ? product.canPrintWithInventory
        : !product.canPrintWithInventory);
    const matchesQuery =
      !query ||
      [
        product.designName,
        product.authorName,
        product.canPrintWithInventory ? "colors ready printable inventory" : "needs colors not printable",
        product.category,
        product.saleUnit,
        product.sourceLink,
        product.hueForgeFilaments
          .map((filament) =>
            [
              filament.brand,
              filament.materialType,
              filament.colorName,
            ].join(" "),
          )
          .join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return matchesFilter && matchesAuthor && matchesCategory && matchesColors && matchesQuery;
  });

  return sortProducts(filtered, filters.sortKey);
}

export function getProductNavigationState(
  editingId: number | null,
  filteredProducts: readonly ProductRecord[],
  products: readonly ProductRecord[],
): ProductNavigationState | null {
  if (editingId == null) {
    return null;
  }

  const visibleIndex = filteredProducts.findIndex((product) => product.id === editingId);
  const navigationProducts = visibleIndex >= 0 ? filteredProducts : products;
  const currentIndex = navigationProducts.findIndex((product) => product.id === editingId);

  if (currentIndex < 0 || navigationProducts.length === 0) {
    return null;
  }

  const count = navigationProducts.length;
  const previousProduct = navigationProducts[(currentIndex - 1 + count) % count]!;
  const nextProduct = navigationProducts[(currentIndex + 1) % count]!;

  return {
    count,
    currentIndex,
    nextProduct,
    previousProduct,
  };
}

export function sortProducts(
  products: readonly ProductRecord[],
  sortKey: ProductSortKey,
): readonly ProductRecord[] {
  if (sortKey === "default") {
    return products;
  }

  return [...products].sort((left, right) => {
    if (sortKey === "design") {
      return compareProductText(left.designName, right.designName);
    }

    return (
      compareProductText(left.authorName, right.authorName) ||
      compareProductText(left.designName, right.designName)
    );
  });
}

export function getProductAuthorFilterOptions(
  products: readonly ProductRecord[],
): readonly string[] {
  const authors = new Set<string>();

  products.forEach((product) => {
    const author = product.authorName.trim();
    if (author.length > 0) {
      authors.add(author);
    }
  });

  return [...authors].sort(compareProductText);
}

function compareProductText(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function ProductFormFields({
  filaments,
  filamentProfiles,
  form,
  setForm,
}: {
  readonly filaments: readonly FilamentRecord[];
  readonly filamentProfiles: readonly FilamentProfileRecord[];
  readonly form: ProductFormState;
  readonly setForm: Dispatch<SetStateAction<ProductFormState>>;
}) {
  return (
    <>
      <FormField label="Design Name" wide>
        <input
          onChange={(event) => setFormValue("designName", event.target.value, setForm)}
          value={form.designName}
        />
      </FormField>
      <FormField label="Source Link" wide>
        <input
          onChange={(event) => setFormValue("sourceLink", event.target.value, setForm)}
          value={form.sourceLink}
        />
      </FormField>
      <FormField label="Author">
        <input
          onChange={(event) => setFormValue("authorName", event.target.value, setForm)}
          value={form.authorName}
        />
      </FormField>
      <FormField label="Category">
        <select
          onChange={(event) =>
            setFormValue("category", event.target.value as ProductCategory, setForm)
          }
          value={form.category}
        >
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Sale Unit">
        <select
          onChange={(event) =>
            setFormValue("saleUnit", event.target.value as ProductSaleUnit, setForm)
          }
          value={form.saleUnit}
        >
          {PRODUCT_SALE_UNITS.map((saleUnit) => (
            <option key={saleUnit} value={saleUnit}>
              {saleUnit}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Print Hours">
        <input
          min="0"
          onChange={(event) => setFormValue("estimatedPrintHours", event.target.value, setForm)}
          placeholder="Unknown"
          step="0.25"
          type="number"
          value={form.estimatedPrintHours}
        />
      </FormField>
      <fieldset className="business-multiselect">
        <legend>Businesses</legend>
        <div className="business-multiselect__options">
          {PRODUCT_BUSINESSES.map((business) => {
            const checked = form.businesses.includes(business);

            return (
              <button
                aria-pressed={checked}
                data-selected={checked ? "true" : "false"}
                key={business}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    businesses: checked
                      ? current.businesses.filter((item) => item !== business)
                      : [...current.businesses, business],
                  }))
                }
                type="button"
              >
                <span aria-hidden="true">{checked ? "✓" : "+"}</span>
                {business}
              </button>
            );
          })}
        </div>
      </fieldset>
      <FormField label="License">
        <select
          onChange={(event) =>
            setFormValue(
              "commercialLicenseStatus",
              event.target.value as CommercialLicenseStatus,
              setForm,
            )
          }
          value={form.commercialLicenseStatus}
        >
          {COMMERCIAL_LICENSE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="License Cost">
        <input
          min="0"
          onChange={(event) => setFormValue("licenseCostAmount", event.target.value, setForm)}
          step="0.01"
          type="number"
          value={form.licenseCostAmount}
        />
      </FormField>
      <FormField label="Billing">
        <select
          onChange={(event) =>
            setFormValue("licenseBillingInterval", event.target.value as LicenseBillingInterval, setForm)
          }
          value={form.licenseBillingInterval}
        >
          {LICENSE_BILLING_INTERVALS.map((interval) => (
            <option key={interval} value={interval}>
              {formatBillingInterval(interval)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Image Ref" wide>
        <input
          onChange={(event) => setFormValue("imageReference", event.target.value, setForm)}
          value={form.imageReference}
        />
      </FormField>
      <div className="inventory-ready-field" data-ready={form.canPrintWithInventory ? "true" : "false"}>
        <label>
          <input
            checked={form.canPrintWithInventory}
            onChange={(event) => setFormValue("canPrintWithInventory", event.target.checked, setForm)}
            type="checkbox"
          />
          <span>Existing Colors Ready</span>
        </label>
        <InventoryReadyBadge canPrintWithInventory={form.canPrintWithInventory} />
      </div>
      <div className="form-section">
        <div className="form-section__header">
          <div className="form-section__title-group">
            <span>Filaments</span>
            <label className="mode-checkbox">
              <input
                checked={form.filamentMode === "basic"}
                onChange={(event) => {
                  const nextMode: ProductFilamentMode = event.target.checked ? "basic" : "hueforge";
                  setForm((current) => ({
                    ...current,
                    filamentMode: nextMode,
                    hueForgeFilaments:
                      nextMode === "basic" && current.hueForgeFilaments.length === 0
                        ? [emptyHueForgeFilament]
                        : current.hueForgeFilaments,
                  }));
                }}
                type="checkbox"
              />
              <span>Not HueForge</span>
            </label>
          </div>
          <ToolbarButton
            onClick={() =>
              setForm((current) => ({
                ...current,
                hueForgeFilaments: [...current.hueForgeFilaments, emptyHueForgeFilament],
              }))
            }
            tone="ghost"
          >
            {form.filamentMode === "basic" ? "Add Filament" : "Add Color"}
          </ToolbarButton>
        </div>
        <div className="filament-editor">
          {form.hueForgeFilaments.length === 0 ? (
            <div className="filament-editor__empty">
              {form.filamentMode === "basic"
                ? "No filament grams saved."
                : "No filament specs saved."}
            </div>
          ) : (
            form.hueForgeFilaments.map((filament, index) => (
              form.filamentMode === "basic" ? (
                <div className="filament-editor__row filament-editor__row--basic" key={index}>
                  <FormField className="form-field--grams" label={`Filament ${index + 1} Grams`}>
                    <input
                      aria-label={`Filament required grams ${index + 1}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        setHueForgeFilamentValue(index, "requiredGrams", event.target.value, setForm)
                      }
                      value={filament.requiredGrams}
                    />
                  </FormField>
                  <button
                    className="filament-editor__remove"
                    onClick={() => removeHueForgeFilament(index, setForm)}
                    type="button"
                  >
                    x
                  </button>
                </div>
              ) : (
                <div
                  className="filament-editor__row filament-editor__row--colorized"
                  key={index}
                  style={getFilamentRowColorStyle(filament.hexColor)}
                >
                  <FormField className="form-field--profile" label="Profile">
                    <FilamentProfileCombobox
                      filaments={filaments}
                      label={`Filament profile ${index + 1}`}
                      onSelect={(profile) => applyFilamentProfile(index, profile, setForm)}
                      profiles={filamentProfiles}
                      selectedProfileId={getSelectedProfileId(filament, filamentProfiles)}
                    />
                  </FormField>
                  <FormField className="form-field--brand" label="Brand">
                    <input
                      aria-label={`Filament brand ${index + 1}`}
                      onChange={(event) =>
                        setHueForgeFilamentValue(index, "brand", event.target.value, setForm)
                      }
                      placeholder="Jayo"
                      value={filament.brand}
                    />
                  </FormField>
                  <FormField className="form-field--material" label="Material">
                    <select
                      aria-label={`Filament material ${index + 1}`}
                      onChange={(event) =>
                        setHueForgeFilamentValue(
                          index,
                          "materialType",
                          event.target.value as FilamentMaterial,
                          setForm,
                        )
                      }
                      value={filament.materialType}
                    >
                      {FILAMENT_MATERIALS.map((material) => (
                        <option key={material} value={material}>
                          {material}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField className="form-field--color" label="Color">
                    <input
                      aria-label={`Filament color ${index + 1}`}
                      onChange={(event) =>
                        setHueForgeFilamentValue(index, "colorName", event.target.value, setForm)
                      }
                      placeholder="Black"
                      value={filament.colorName}
                    />
                  </FormField>
                  <FormField className="form-field--hex" label="Hex">
                    <input
                      aria-label={`Filament hex ${index + 1}`}
                      onBlur={() => {
                        if (filament.hexColor.trim()) {
                          setHueForgeFilamentValue(
                            index,
                            "hexColor",
                            normalizeHexColor(filament.hexColor),
                            setForm,
                          );
                        }
                      }}
                      onChange={(event) =>
                        setHueForgeFilamentValue(index, "hexColor", event.target.value, setForm)
                      }
                      placeholder="#000000 or 000000"
                      value={filament.hexColor}
                    />
                  </FormField>
                  <FormField className="form-field--td" label="TD">
                    <input
                      aria-label={`Filament TD ${index + 1}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        setHueForgeFilamentValue(index, "transmissionDistance", event.target.value, setForm)
                      }
                      value={filament.transmissionDistance}
                    />
                  </FormField>
                  <FormField className="form-field--grams" label="Grams">
                    <input
                      aria-label={`Filament required grams ${index + 1}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        setHueForgeFilamentValue(index, "requiredGrams", event.target.value, setForm)
                      }
                      value={filament.requiredGrams}
                    />
                  </FormField>
                  <div className="filament-editor__alternatives">
                    <span>Alternatives</span>
                    <FilamentSpoolCombobox
                      label={`Filament alternatives ${index + 1}`}
                      onSelect={(spool) => addAlternativeFilament(index, spool.id, setForm)}
                      spools={getAvailableAlternativeFilaments(filament, filaments)}
                    />
                    <div className="filament-editor__alternative-list">
                      {filament.alternativeFilamentIds.length === 0 ? (
                        <small>No alternatives saved.</small>
                      ) : (
                        filament.alternativeFilamentIds.map((filamentId) => (
                          <button
                            key={filamentId}
                            onClick={() => removeAlternativeFilament(index, filamentId, setForm)}
                            type="button"
                          >
                            {formatAlternativeFilamentLabel(filamentId, filaments)}
                            <span aria-hidden="true">x</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <button
                    className="filament-editor__remove"
                    onClick={() => removeHueForgeFilament(index, setForm)}
                    type="button"
                  >
                    x
                  </button>
                </div>
              )
            ))
          )}
          <div className="filament-editor__footer">
            {form.filamentMode === "basic"
              ? "Basic filament rows store grams only and do not create reusable color profiles."
              : filamentProfiles.length === 0
                ? "Save this product with a valid filament row to create the first reusable profile."
                : `${filamentProfiles.length} reusable profiles available. New valid rows are saved as profiles after product save.`}
          </div>
        </div>
      </div>
      <FormField label="Notes" wide>
        <textarea
          onChange={(event) => setFormValue("notes", event.target.value, setForm)}
          value={form.notes}
        />
      </FormField>
    </>
  );
}

function FilamentProfileCombobox({
  filaments,
  label,
  onSelect,
  profiles,
  selectedProfileId,
}: {
  readonly filaments: readonly FilamentRecord[];
  readonly label: string;
  readonly onSelect: (profile: FilamentProfileRecord) => void;
  readonly profiles: readonly FilamentProfileRecord[];
  readonly selectedProfileId: string;
}) {
  const selectedProfile = profiles.find((profile) => String(profile.id) === selectedProfileId) ?? null;
  const selectedDisplay = selectedProfile ? formatFilamentProfileLabel(selectedProfile) : "Manual entry";
  const listboxId = `filament-profile-${label.replace(/\s+/g, "-").toLowerCase()}-listbox`;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(selectedDisplay);

  useEffect(() => {
    if (!isOpen) {
      setQuery(selectedDisplay);
    }
  }, [isOpen, selectedDisplay]);

  const filteredProfiles = useMemo(
    () => filterFilamentProfiles(query, profiles, filaments),
    [filaments, profiles, query],
  );
  const boundedActiveIndex =
    filteredProfiles.length > 0
      ? Math.min(activeIndex, filteredProfiles.length - 1)
      : -1;
  const activeProfile = boundedActiveIndex >= 0 ? filteredProfiles[boundedActiveIndex] : null;

  function openWithSelection(): void {
    setIsOpen(true);
    const selectedIndex = filteredProfiles.findIndex(
      (profile) => String(profile.id) === selectedProfileId,
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }

  function chooseProfile(profile: FilamentProfileRecord): void {
    onSelect(profile);
    setQuery(formatFilamentProfileLabel(profile));
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        filteredProfiles.length === 0 ? 0 : (current + 1) % filteredProfiles.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        filteredProfiles.length === 0
          ? 0
          : (current - 1 + filteredProfiles.length) % filteredProfiles.length,
      );
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();

      if (activeProfile) {
        chooseProfile(activeProfile);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery(selectedDisplay);
    }
  }

  return (
    <div
      className="filament-profile-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <input
        aria-activedescendant={isOpen && activeProfile ? getFilamentProfileOptionId(listboxId, activeProfile) : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-label={label}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onFocus={openWithSelection}
        onKeyDown={handleKeyDown}
        placeholder="Search brand, color, material, TD..."
        role="combobox"
        value={query}
      />
      {isOpen ? (
        <div className="filament-profile-combobox__menu" id={listboxId} role="listbox">
          <div className="filament-profile-combobox__manual">
            <strong>Manual entry</strong>
            <span>Edit the row fields directly for a custom filament.</span>
          </div>
          {filteredProfiles.length > 0 ? (
            filteredProfiles.map((profile, index) => {
              const stock = getFilamentProfileStockSummary(profile, filaments);
              const isActive = index === boundedActiveIndex;
              const isSelected = String(profile.id) === selectedProfileId;

              return (
                <div
                  aria-selected={isSelected}
                  className="filament-profile-combobox__option"
                  data-active={isActive ? "true" : "false"}
                  data-selected={isSelected ? "true" : "false"}
                  id={getFilamentProfileOptionId(listboxId, profile)}
                  key={profile.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseProfile(profile);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                >
                  <span
                    aria-label={profile.colorName}
                    className="filament-profile-combobox__swatch"
                    style={{ backgroundColor: normalizeHexColor(profile.hexColor) }}
                  />
                  <span className="filament-profile-combobox__identity">
                    <strong>{profile.colorName}</strong>
                    <span>{profile.brand}</span>
                  </span>
                  <span className="filament-profile-combobox__chips">
                    <Badge>{profile.materialType}</Badge>
                    <Badge>
                      {profile.transmissionDistance == null
                        ? "TD --"
                        : `TD ${profile.transmissionDistance}`}
                    </Badge>
                  </span>
                  <span className="filament-profile-combobox__stock">
                    {formatFilamentProfileStockSummary(stock)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="filament-profile-combobox__empty">No saved profiles match this search.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FilamentSpoolCombobox({
  label,
  onSelect,
  spools,
}: {
  readonly label: string;
  readonly onSelect: (spool: FilamentRecord) => void;
  readonly spools: readonly FilamentRecord[];
}) {
  const listboxId = `filament-spool-${label.replace(/\s+/g, "-").toLowerCase()}-listbox`;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredSpools = useMemo(
    () => filterFilamentSpools(query, spools),
    [query, spools],
  );
  const boundedActiveIndex =
    filteredSpools.length > 0
      ? Math.min(activeIndex, filteredSpools.length - 1)
      : -1;
  const activeSpool = boundedActiveIndex >= 0 ? filteredSpools[boundedActiveIndex] : null;

  function chooseSpool(spool: FilamentRecord): void {
    onSelect(spool);
    setQuery("");
    setActiveIndex(0);
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        filteredSpools.length === 0 ? 0 : (current + 1) % filteredSpools.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        filteredSpools.length === 0
          ? 0
          : (current - 1 + filteredSpools.length) % filteredSpools.length,
      );
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();

      if (activeSpool) {
        chooseSpool(activeSpool);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      className="filament-spool-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <input
        aria-activedescendant={isOpen && activeSpool ? getFilamentSpoolOptionId(listboxId, activeSpool) : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-label={label}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search inventory spool..."
        role="combobox"
        value={query}
      />
      {isOpen ? (
        <div className="filament-spool-combobox__menu" id={listboxId} role="listbox">
          {filteredSpools.length > 0 ? (
            filteredSpools.map((spool, index) => {
              const isActive = index === boundedActiveIndex;

              return (
                <div
                  aria-selected={isActive}
                  className="filament-spool-combobox__option"
                  data-active={isActive ? "true" : "false"}
                  id={getFilamentSpoolOptionId(listboxId, spool)}
                  key={spool.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseSpool(spool);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                >
                  <span
                    aria-label={spool.colorName}
                    className="filament-spool-combobox__swatch"
                    style={{ backgroundColor: normalizeHexColor(spool.hexColor) }}
                  />
                  <span className="filament-spool-combobox__identity">
                    <strong>{spool.name || `${spool.brand} ${spool.colorName}`}</strong>
                    <span>{spool.brand} · {spool.colorName}</span>
                  </span>
                  <span className="filament-spool-combobox__chips">
                    <Badge>{spool.materialType}</Badge>
                    <Badge>
                      {spool.transmissionDistance == null
                        ? "TD --"
                        : `TD ${spool.transmissionDistance}`}
                    </Badge>
                  </span>
                  <span className="filament-spool-combobox__stock">
                    {formatAvailableGrams(spool.estimatedGramsLeft)} left · {spool.spoolStatus}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="filament-spool-combobox__empty">No inventory spools match this search.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FormField({
  children,
  className = "",
  label,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label: string;
  readonly wide?: boolean;
}) {
  return (
    <label className={`form-field${className ? ` ${className}` : ""}`} data-wide={wide ? "true" : "false"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function getFilamentRowColorStyle(hexColor: string): CSSProperties | undefined {
  if (!isHexColor(hexColor)) {
    return undefined;
  }

  const normalizedHex = normalizeHexColor(hexColor);
  const useDarkText = getHexRelativeLuminance(normalizedHex) > 0.54;
  const textColor = useDarkText ? "#101412" : "#f6f8f5";
  const mutedColor = useDarkText ? "rgba(16, 20, 18, 0.76)" : "rgba(246, 248, 245, 0.78)";
  const softFill = useDarkText ? "rgba(16, 20, 18, 0.12)" : "rgba(255, 255, 255, 0.13)";
  const borderColor = useDarkText ? "rgba(16, 20, 18, 0.42)" : "rgba(255, 255, 255, 0.45)";

  return {
    "--filament-row-border": borderColor,
    "--filament-row-color": normalizedHex,
    "--filament-row-muted": mutedColor,
    "--filament-row-soft-fill": softFill,
    "--filament-row-text": textColor,
  } as CSSProperties;
}

function getHexRelativeLuminance(hexColor: string): number {
  const hex = normalizeHexColor(hexColor).slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const linearRed = toLinearRgbChannel(red);
  const linearGreen = toLinearRgbChannel(green);
  const linearBlue = toLinearRgbChannel(blue);

  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

function toLinearRgbChannel(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function setFormValue<K extends keyof ProductFormState>(
  key: K,
  value: ProductFormState[K],
  setForm: Dispatch<SetStateAction<ProductFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function setHueForgeFilamentValue<K extends keyof ProductHueForgeFilamentForm>(
  index: number,
  key: K,
  value: ProductHueForgeFilamentForm[K],
  setForm: Dispatch<SetStateAction<ProductFormState>>,
): void {
  setForm((current) => ({
    ...current,
    hueForgeFilaments: current.hueForgeFilaments.map((filament, currentIndex) =>
      currentIndex === index ? { ...filament, [key]: value } : filament,
    ),
  }));
}

function applyFilamentProfile(
  index: number,
  profile: FilamentProfileRecord,
  setForm: Dispatch<SetStateAction<ProductFormState>>,
): void {
  setForm((current) => ({
    ...current,
    hueForgeFilaments: current.hueForgeFilaments.map((filament, currentIndex) =>
      currentIndex === index
        ? {
            ...filament,
            brand: profile.brand,
            colorName: profile.colorName,
            hexColor: profile.hexColor,
            materialType: profile.materialType,
            transmissionDistance:
              profile.transmissionDistance == null ? "" : String(profile.transmissionDistance),
          }
        : filament,
    ),
  }));
}

function addAlternativeFilament(
  index: number,
  filamentId: number,
  setForm: Dispatch<SetStateAction<ProductFormState>>,
): void {
  setForm((current) => ({
    ...current,
    hueForgeFilaments: current.hueForgeFilaments.map((filament, currentIndex) => {
      if (currentIndex !== index || filament.alternativeFilamentIds.includes(filamentId)) {
        return filament;
      }

      return {
        ...filament,
        alternativeFilamentIds: [...filament.alternativeFilamentIds, filamentId],
      };
    }),
  }));
}

function removeAlternativeFilament(
  index: number,
  filamentId: number,
  setForm: Dispatch<SetStateAction<ProductFormState>>,
): void {
  setForm((current) => ({
    ...current,
    hueForgeFilaments: current.hueForgeFilaments.map((filament, currentIndex) =>
      currentIndex === index
        ? {
            ...filament,
            alternativeFilamentIds: filament.alternativeFilamentIds.filter((id) => id !== filamentId),
          }
        : filament,
    ),
  }));
}

function getAvailableAlternativeFilaments(
  filament: ProductHueForgeFilamentForm,
  filaments: readonly FilamentRecord[],
): readonly FilamentRecord[] {
  const selectedFilamentIds = new Set(filament.alternativeFilamentIds);

  return filaments.filter(
    (spool) => spool.spoolStatus !== "archived" && !selectedFilamentIds.has(spool.id),
  );
}

function getSelectedProfileId(
  filament: ProductHueForgeFilamentForm,
  profiles: readonly FilamentProfileRecord[],
): string {
  const matchedProfile = profiles.find((profile) =>
    doesFilamentMatchProfile(filament, profile),
  );

  return matchedProfile ? String(matchedProfile.id) : "";
}

function doesFilamentMatchProfile(
  filament: ProductHueForgeFilamentForm,
  profile: FilamentProfileRecord,
): boolean {
  const filamentTd = filament.transmissionDistance.trim()
    ? Number(filament.transmissionDistance)
    : null;

  return (
    filament.brand.trim().toLowerCase() === profile.brand.toLowerCase() &&
    filament.materialType === profile.materialType &&
    filament.colorName.trim().toLowerCase() === profile.colorName.toLowerCase() &&
    normalizeHexColor(filament.hexColor) === profile.hexColor &&
    filamentTd === profile.transmissionDistance
  );
}

function formatFilamentProfileLabel(profile: FilamentProfileRecord): string {
  const tdLabel =
    profile.transmissionDistance == null ? "TD --" : `TD ${profile.transmissionDistance}`;

  return `${profile.brand} ${profile.materialType} ${profile.colorName} / ${tdLabel}`;
}

function filterFilamentProfiles(
  query: string,
  profiles: readonly FilamentProfileRecord[],
  filaments: readonly FilamentRecord[],
): readonly FilamentProfileRecord[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized || normalized === "manual entry") {
    return profiles;
  }

  return profiles.filter((profile) => {
    const stock = getFilamentProfileStockSummary(profile, filaments);

    return [
      profile.brand,
      profile.materialType,
      profile.colorName,
      profile.transmissionDistance == null ? "TD --" : `TD ${profile.transmissionDistance}`,
      profile.hexColor,
      formatFilamentProfileStockSummary(stock),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

function filterFilamentSpools(
  query: string,
  spools: readonly FilamentRecord[],
): readonly FilamentRecord[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return spools;
  }

  return spools.filter((spool) =>
    [
      spool.brand,
      spool.name,
      spool.materialType,
      spool.colorName,
      spool.transmissionDistance == null ? "TD --" : `TD ${spool.transmissionDistance}`,
      spool.hexColor,
      formatAvailableGrams(spool.estimatedGramsLeft),
      spool.spoolStatus,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function getFilamentProfileStockSummary(
  profile: FilamentProfileRecord,
  filaments: readonly FilamentRecord[],
): {
  readonly gramsLeft: number;
  readonly statusCounts: Partial<Record<SpoolStatus, number>>;
  readonly spoolCount: number;
} {
  const matchingFilaments = filaments.filter((filament) =>
    filament.spoolStatus !== "archived" && doesFilamentMatchProfileRecord(filament, profile),
  );

  return {
    gramsLeft: matchingFilaments.reduce(
      (sum, filament) => sum + Math.max(0, filament.estimatedGramsLeft),
      0,
    ),
    spoolCount: matchingFilaments.length,
    statusCounts: matchingFilaments.reduce<Partial<Record<SpoolStatus, number>>>(
      (counts, filament) => ({
        ...counts,
        [filament.spoolStatus]: (counts[filament.spoolStatus] ?? 0) + 1,
      }),
      {},
    ),
  };
}

function doesFilamentMatchProfileRecord(
  filament: FilamentRecord,
  profile: FilamentProfileRecord,
): boolean {
  return (
    filament.brand.trim().toLowerCase() === profile.brand.trim().toLowerCase() &&
    filament.materialType === profile.materialType &&
    filament.colorName.trim().toLowerCase() === profile.colorName.trim().toLowerCase() &&
    normalizeHexColor(filament.hexColor) === normalizeHexColor(profile.hexColor) &&
    areTransmissionDistancesEqual(filament.transmissionDistance, profile.transmissionDistance)
  );
}

function areTransmissionDistancesEqual(
  first: number | null,
  second: number | null,
): boolean {
  if (first == null || second == null) {
    return first == null && second == null;
  }

  return Math.abs(first - second) < 0.0001;
}

function formatFilamentProfileStockSummary({
  gramsLeft,
  spoolCount,
  statusCounts,
}: {
  readonly gramsLeft: number;
  readonly statusCounts: Partial<Record<SpoolStatus, number>>;
  readonly spoolCount: number;
}): string {
  if (spoolCount === 0) {
    return "No matching stock";
  }

  return `${formatAvailableGrams(gramsLeft)} available · ${formatSpoolStatusCounts(statusCounts)}`;
}

function formatAvailableGrams(grams: number): string {
  if (!Number.isFinite(grams)) {
    return "--";
  }

  return `${Math.max(0, Math.round(grams)).toLocaleString()}g`;
}

function formatSpoolStatusCounts(
  statusCounts: Partial<Record<SpoolStatus, number>>,
): string {
  return (["open", "sealed", "empty"] as const)
    .flatMap((status) => {
      const count = statusCounts[status] ?? 0;

      return count > 0 ? [`${count} ${status}`] : [];
    })
    .join(", ");
}

function getFilamentProfileOptionId(
  listboxId: string,
  profile: FilamentProfileRecord,
): string {
  return `${listboxId}-option-${profile.id}`;
}

function getFilamentSpoolOptionId(
  listboxId: string,
  spool: FilamentRecord,
): string {
  return `${listboxId}-option-${spool.id}`;
}

function formatFilamentSpoolLabel(spool: FilamentRecord): string {
  const tdLabel =
    spool.transmissionDistance == null ? "TD --" : `TD ${spool.transmissionDistance}`;
  const stockLabel = `${Math.round(spool.estimatedGramsLeft)}g ${spool.spoolStatus}`;

  return `${spool.brand} ${spool.materialType} ${spool.colorName} / ${tdLabel} / ${stockLabel}`;
}

function formatAlternativeFilamentLabel(
  filamentId: number,
  filaments: readonly FilamentRecord[],
): string {
  const spool = filaments.find((item) => item.id === filamentId);

  return spool ? formatFilamentSpoolLabel(spool) : `Spool ${filamentId}`;
}

function formatAlternativeFilamentLabels(
  filamentIds: readonly number[],
  filaments: readonly FilamentRecord[],
): readonly string[] {
  return filamentIds.map((filamentId) => formatAlternativeFilamentLabel(filamentId, filaments));
}

function formatShoppingFilamentName(
  product: ProductRecord,
  filament: ProductHueForgeFilament,
): string {
  const namedFilament = [
    filament.brand,
    filament.colorName,
    filament.materialType,
  ].filter((part) => part.trim().length > 0).join(" ");

  return namedFilament || `Filament for ${product.designName}`;
}

function removeHueForgeFilament(
  index: number,
  setForm: Dispatch<SetStateAction<ProductFormState>>,
): void {
  setForm((current) => ({
    ...current,
    hueForgeFilaments: current.hueForgeFilaments.filter((_, currentIndex) => currentIndex !== index),
  }));
}

function toProductInput(form: ProductFormState): ProductInput {
  return {
    authorName: form.authorName,
    businesses: form.businesses,
    canPrintWithInventory: form.canPrintWithInventory,
    category: form.category,
    commercialLicenseStatus: form.commercialLicenseStatus,
    designName: form.designName,
    estimatedPrintHours: parseOptionalNumber(form.estimatedPrintHours),
    filamentMode: form.filamentMode,
    hueForgeFilaments: form.hueForgeFilaments.map((filament) =>
      form.filamentMode === "basic"
        ? toBasicFilamentInput(filament)
        : toHueForgeFilamentInput(filament),
    ),
    imageReference: form.imageReference,
    licenseBillingInterval: form.licenseBillingInterval,
    licenseCostAmount: Number(form.licenseCostAmount),
    notes: form.notes,
    saleUnit: form.saleUnit,
    sourceLink: form.sourceLink,
  };
}

function toFormState(product: ProductRecord): ProductFormState {
  return {
    authorName: product.authorName,
    businesses: product.businesses,
    canPrintWithInventory: product.canPrintWithInventory,
    category: product.category,
    commercialLicenseStatus: product.commercialLicenseStatus,
    designName: product.designName,
    estimatedPrintHours: product.estimatedPrintHours == null ? "" : String(product.estimatedPrintHours),
    filamentMode: product.filamentMode,
    hueForgeFilaments: product.hueForgeFilaments.map(toHueForgeFilamentForm),
    imageReference: product.imageReference,
    licenseBillingInterval: product.licenseBillingInterval,
    licenseCostAmount: String(product.licenseCostAmount),
    notes: product.notes,
    saleUnit: product.saleUnit,
    sourceLink: product.sourceLink,
  };
}

function getDuplicateDesignName(
  designName: string,
  products: readonly ProductRecord[],
): string {
  const baseName = designName.trim() || "Product";
  const existingNames = new Set(
    products.map((product) => product.designName.trim().toLocaleLowerCase()),
  );

  for (let copyNumber = 1; copyNumber < 1000; copyNumber += 1) {
    const candidate =
      copyNumber === 1
        ? `${baseName} (Copy)`
        : `${baseName} (Copy ${copyNumber})`;

    if (!existingNames.has(candidate.toLocaleLowerCase())) {
      return candidate;
    }
  }

  return `${baseName} (Copy ${Date.now()})`;
}

function toBasicFilamentInput(
  form: ProductHueForgeFilamentForm,
): ProductHueForgeFilament {
  return {
    alternativeFilamentIds: [],
    brand: "",
    colorName: "",
    hexColor: "",
    layerRange: "",
    materialType: "Other",
    purchaseSource: "",
    requiredGrams: Number(form.requiredGrams),
    role: "",
    transmissionDistance: null,
  };
}

function toHueForgeFilamentInput(
  form: ProductHueForgeFilamentForm,
): ProductHueForgeFilament {
  return {
    alternativeFilamentIds: form.alternativeFilamentIds,
    brand: form.brand,
    colorName: form.colorName,
    hexColor: form.hexColor.trim() ? normalizeHexColor(form.hexColor) : "",
    layerRange: form.layerRange,
    materialType: form.materialType,
    purchaseSource: form.purchaseSource,
    requiredGrams: Number(form.requiredGrams),
    role: form.role,
    transmissionDistance: form.transmissionDistance.trim()
      ? Number(form.transmissionDistance)
      : null,
  };
}

function toHueForgeFilamentForm(
  filament: ProductHueForgeFilament,
): ProductHueForgeFilamentForm {
  return {
    alternativeFilamentIds: filament.alternativeFilamentIds,
    brand: filament.brand,
    colorName: filament.colorName,
    hexColor: filament.hexColor,
    layerRange: filament.layerRange,
    materialType: filament.materialType,
    purchaseSource: filament.purchaseSource,
    requiredGrams: String(filament.requiredGrams),
    role: filament.role,
    transmissionDistance:
      filament.transmissionDistance == null ? "" : String(filament.transmissionDistance),
  };
}

function formatBillingInterval(interval: LicenseBillingInterval): string {
  if (interval === "none") {
    return "No recurring fee";
  }

  return interval;
}

function parseOptionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function formatEstimatedPrintHours(hours: number | null): string {
  if (hours == null) {
    return "--";
  }

  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function formatCompactPrintHours(hours: number | null): string {
  return hours == null ? "--" : `${hours}h`;
}

function formatProductId(id: number): string {
  return `PRD-${String(id).padStart(4, "0")}`;
}

function isRenderableImageReference(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("data:image/")
  );
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(normalizeHexColor(value));
}

function getHueForgeSpecCount(product: ProductRecord): number {
  return product.filamentMode === "hueforge" ? product.hueForgeFilaments.length : 0;
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "This screen needs the desktop app database. A browser preview can render the page, but it cannot use the Tauri SQLite plugin.";
    }

    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Product storage is unavailable because the local SQLite database could not be opened.";
}
