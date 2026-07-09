import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
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
} from "@/domain/inventory";
import {
  COMMERCIAL_LICENSE_STATUSES,
  LICENSE_BILLING_INTERVALS,
  PRODUCT_CATEGORIES,
  PRODUCT_SALE_UNITS,
  getLicensePaymentDisplay,
  getLicenseWarningDisplay,
  getFilamentProfileInputsFromProductInput,
  validateProductInput,
  type CommercialLicenseStatus,
  type ProductFilamentMode,
  type LicenseBillingInterval,
  type ProductCategory,
  type ProductInput,
  type ProductHueForgeFilament,
  type ProductRecord,
  type ProductSaleUnit,
} from "@/domain/products";

type FilterValue = "all" | "warning" | "with-image" | "no-image";

interface ProductFormState {
  readonly authorName: string;
  readonly category: ProductCategory;
  readonly commercialLicenseStatus: CommercialLicenseStatus;
  readonly designName: string;
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
  category: "Bookmarks",
  commercialLicenseStatus: "unknown",
  designName: "",
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isShoppingItemSaving, setIsShoppingItemSaving] = useState(false);
  const [filamentProfiles, setFilamentProfiles] = useState<FilamentProfileRecord[]>([]);
  const [filaments, setFilaments] = useState<FilamentRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
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

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const license = getLicenseWarningDisplay(product.commercialLicenseStatus);
      const hasImage = product.imageReference.trim().length > 0;
      const matchesFilter =
        filter === "all" ||
        (filter === "warning"
          ? license.shouldWarn
          : filter === "with-image"
            ? hasImage
            : !hasImage);
      const matchesQuery =
        !query ||
        [
          product.designName,
          product.authorName,
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

      return matchesFilter && matchesQuery;
    });
  }, [filter, products, search]);

  const warningCount = products.filter((product) =>
    getLicenseWarningDisplay(product.commercialLicenseStatus).shouldWarn,
  ).length;
  const imageCount = products.filter((product) => product.imageReference.trim().length > 0).length;
  const hueForgeCount = products.filter((product) => getHueForgeSpecCount(product) > 0).length;

  function startCreate(): void {
    setEditingId(null);
    setForm(emptyForm);
    setValidationMessage(null);
    setIsFormOpen(true);
  }

  function startEdit(product: ProductRecord): void {
    setEditingId(product.id);
    setSelectedId(product.id);
    setForm(toFormState(product));
    setValidationMessage(null);
    setIsFormOpen(true);
  }

  function closeForm(): void {
    if (isSaving) {
      return;
    }

    setIsFormOpen(false);
    setValidationMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    const input = toProductInput(form);
    const validation = validateProductInput(input);

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
      setForm(toFormState(saved));
      setIsFormOpen(false);
      if (profilesUpdated) {
        showToast(
          "success",
          editingId == null ? "Product Saved" : "Product Updated",
          `${saved.designName} was saved locally.`,
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
        quantityNeeded: Math.max(1, filament.requiredGrams),
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
            columns={["Img", "Design", "Category", "Author", "HF", "License"]}
            columnsTemplate="52px minmax(220px, 1.55fr) minmax(116px, 0.72fr) minmax(104px, 0.8fr) minmax(62px, 0.34fr) minmax(128px, 0.78fr)"
            density="dense"
            footer={
              isLoading
                ? "Loading local SQLite records..."
                : `${filteredProducts.length} visible of ${products.length} product records.`
            }
            rows={filteredProducts.map((product) => {
              const license = getLicenseWarningDisplay(product.commercialLicenseStatus);
              const currentCategoryTone = categoryTone[product.category];

              return [
                <ProductThumb product={product} />,
                <button
                  className="table-link"
                  onClick={() => {
                    setSelectedId(product.id);
                    startEdit(product);
                  }}
                  type="button"
                >
                  <span className="row-title">
                    <strong>{product.designName}</strong>
                    <small>{product.sourceLink}</small>
                  </span>
                </button>,
                <Badge {...(currentCategoryTone ? { tone: currentCategoryTone } : {})}>
                  {product.category}
                </Badge>,
                product.authorName,
                getHueForgeSpecCount(product) > 0 ? (
                  <Badge tone="accent">{getHueForgeSpecCount(product)}</Badge>
                ) : (
                  <Badge>0</Badge>
                ),
                <Badge tone={license.tone}>{license.label}</Badge>,
              ];
            })}
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

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="product-form-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <header className="modal__header">
              <h2 id="product-form-title">
                {editingId == null ? "Add Product" : "Edit Product"}
              </h2>
              <button
                aria-label="Close product form"
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
                  {editingId == null ? "Save Product" : "Update Product"}
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
  product,
  onEdit,
}: {
  readonly filaments: readonly FilamentRecord[];
  readonly isDeleting: boolean;
  readonly isShoppingItemSaving: boolean;
  readonly onAddFilamentToShoppingList: (filament: ProductHueForgeFilament) => void;
  readonly onDelete: () => void;
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
        <ToolbarButton onClick={onEdit} tone="primary">
          Edit Selected
        </ToolbarButton>
      </div>
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
          <div className="product-filament-list__item" key={`${filament.brand}-${filament.colorName}-${index}`}>
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
                <div className="filament-editor__row" key={index}>
                  <FormField className="form-field--profile" label="Profile">
                    <select
                      aria-label={`Filament profile ${index + 1}`}
                      onChange={(event) => {
                        const profile = filamentProfiles.find(
                          (currentProfile) => String(currentProfile.id) === event.target.value,
                        );

                        if (profile) {
                          applyFilamentProfile(index, profile, setForm);
                        }
                      }}
                      value={getSelectedProfileId(filament, filamentProfiles)}
                    >
                      <option value="">Manual entry</option>
                      {filamentProfiles.length === 0 ? (
                        <option disabled value="__empty">
                          No saved profiles yet
                        </option>
                      ) : null}
                      {filamentProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {formatFilamentProfileLabel(profile)}
                        </option>
                      ))}
                    </select>
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
                    <span className="hex-preview-field">
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
                      <span
                        aria-label={
                          isHexColor(filament.hexColor)
                            ? `Preview ${filament.hexColor}`
                            : "No valid hex preview"
                        }
                        className="hex-preview-field__swatch"
                        role="img"
                        style={
                          isHexColor(filament.hexColor)
                            ? { backgroundColor: normalizeHexColor(filament.hexColor) }
                            : undefined
                        }
                      />
                    </span>
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
                    <select
                      aria-label={`Filament alternatives ${index + 1}`}
                      onChange={(event) => {
                        if (event.target.value) {
                          addAlternativeFilament(index, Number(event.target.value), setForm);
                          event.target.value = "";
                        }
                      }}
                      value=""
                    >
                      <option value="">Add inventory spool...</option>
                      {getAvailableAlternativeFilaments(filament, filaments).map((spool) => (
                        <option key={spool.id} value={spool.id}>
                          {formatFilamentSpoolLabel(spool)}
                        </option>
                      ))}
                    </select>
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
    category: form.category,
    commercialLicenseStatus: form.commercialLicenseStatus,
    designName: form.designName,
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
    category: product.category,
    commercialLicenseStatus: product.commercialLicenseStatus,
    designName: product.designName,
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
