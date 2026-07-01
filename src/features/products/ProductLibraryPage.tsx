import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  SearchField,
  SegmentedFilter,
  ToolbarButton,
} from "@/components/ui";
import { productsRepository } from "@/data/repositories";
import {
  COMMERCIAL_LICENSE_STATUSES,
  PRODUCT_CATEGORIES,
  PRODUCT_SALE_UNITS,
  getLicenseWarningDisplay,
  validateProductInput,
  type CommercialLicenseStatus,
  type ProductCategory,
  type ProductInput,
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
  readonly licenseNotes: string;
  readonly notes: string;
  readonly saleUnit: ProductSaleUnit;
  readonly sourceLink: string;
}

const emptyForm: ProductFormState = {
  authorName: "",
  category: "Accessory",
  commercialLicenseStatus: "unknown",
  designName: "",
  imageReference: "",
  licenseNotes: "",
  notes: "",
  saleUnit: "piece",
  sourceLink: "",
};

const categoryTone: Partial<Record<ProductCategory, "accent" | "success" | "warning">> = {
  Accessory: "success",
  Decor: "accent",
  HueForge: "warning",
};

export function ProductLibraryPage() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadProducts(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await productsRepository.list();
      setProducts(loaded);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
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
      const license = getLicenseWarningDisplay(
        product.commercialLicenseStatus,
        product.licenseNotes,
      );
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
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesFilter && matchesQuery;
    });
  }, [filter, products, search]);

  const warningCount = products.filter((product) =>
    getLicenseWarningDisplay(product.commercialLicenseStatus, product.licenseNotes).shouldWarn,
  ).length;
  const imageCount = products.filter((product) => product.imageReference.trim().length > 0).length;
  const categoryCount = new Set(products.map((product) => product.category)).size;

  function startCreate(): void {
    setEditingId(null);
    setForm(emptyForm);
    setValidationMessage(null);
  }

  function startEdit(product: ProductRecord): void {
    setEditingId(product.id);
    setSelectedId(product.id);
    setForm(toFormState(product));
    setValidationMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    const input = toProductInput(form);
    const validation = validateProductInput(input);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the product fields.");
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

      setProducts(loaded);
      setSelectedId(saved.id);
      setEditingId(saved.id);
      setForm(toFormState(saved));
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton onClick={() => void loadProducts()}>Refresh</ToolbarButton>
          <ToolbarButton onClick={startCreate} tone="primary">
            Add Product
          </ToolbarButton>
        </>
      }
      description="Products, source links, authors, sale units, license warnings, notes, and one optional image reference for future workflows."
      meta={["SQLite local", "Image reference only", "No costing or inventory deduction"]}
      title="Design Library"
    >
      {error ? (
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
        <MetricPanel detail="active categories" label="Categories" tone="success" value={String(categoryCount)} />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Product Catalog">
          <DataTable
            columns={["Img", "Design", "Category", "Author", "Unit", "License"]}
            columnsTemplate="52px minmax(168px, 1.45fr) 0.7fr minmax(104px, 0.9fr) 0.48fr 0.85fr"
            density="dense"
            footer={
              isLoading
                ? "Loading local SQLite records..."
                : `${filteredProducts.length} visible of ${products.length} product records.`
            }
            rows={filteredProducts.map((product) => {
              const license = getLicenseWarningDisplay(
                product.commercialLicenseStatus,
                product.licenseNotes,
              );
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
                product.saleUnit,
                <Badge tone={license.tone}>{license.label}</Badge>,
              ];
            })}
          />
        </Panel>

        <div className="side-stack">
          <Panel title="Product Detail">
            {selectedProduct ? (
              <ProductDetail product={selectedProduct} onEdit={() => startEdit(selectedProduct)} />
            ) : (
              <div className="empty-state">
                <Badge>Empty</Badge>
                <p>Add a design or product record to start building the library.</p>
              </div>
            )}
          </Panel>

          <Panel title={editingId == null ? "Add Product" : "Edit Product"}>
            <form className="inventory-form" onSubmit={(event) => void handleSubmit(event)}>
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
              <FormField label="Image Ref" wide>
                <input
                  onChange={(event) => setFormValue("imageReference", event.target.value, setForm)}
                  value={form.imageReference}
                />
              </FormField>
              <FormField label="License Notes" wide>
                <textarea
                  onChange={(event) => setFormValue("licenseNotes", event.target.value, setForm)}
                  value={form.licenseNotes}
                />
              </FormField>
              <FormField label="Notes" wide>
                <textarea
                  onChange={(event) => setFormValue("notes", event.target.value, setForm)}
                  value={form.notes}
                />
              </FormField>
              {validationMessage ? (
                <div className="form-message" role="alert">
                  {validationMessage}
                </div>
              ) : null}
              <div className="form-actions">
                <ToolbarButton onClick={startCreate}>Clear</ToolbarButton>
                <ToolbarButton disabled={isSaving} tone="primary" type="submit">
                  {editingId == null ? "Save Product" : "Update Product"}
                </ToolbarButton>
              </div>
            </form>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function ProductDetail({
  product,
  onEdit,
}: {
  readonly product: ProductRecord;
  readonly onEdit: () => void;
}) {
  const license = getLicenseWarningDisplay(
    product.commercialLicenseStatus,
    product.licenseNotes,
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
          <span>ID: PRD-{String(product.id).padStart(4, "0")}</span>
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
      </div>
      <div className="callout">
        <Badge>Notes</Badge>
        <p>{product.notes || "No product notes saved."}</p>
      </div>
      <ToolbarButton onClick={onEdit} tone="primary">
        Edit Selected
      </ToolbarButton>
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

function FormField({
  children,
  label,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly wide?: boolean;
}) {
  return (
    <label className="form-field" data-wide={wide ? "true" : "false"}>
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

function toProductInput(form: ProductFormState): ProductInput {
  return {
    authorName: form.authorName,
    category: form.category,
    commercialLicenseStatus: form.commercialLicenseStatus,
    designName: form.designName,
    imageReference: form.imageReference,
    licenseNotes: form.licenseNotes,
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
    imageReference: product.imageReference,
    licenseNotes: product.licenseNotes,
    notes: product.notes,
    saleUnit: product.saleUnit,
    sourceLink: product.sourceLink,
  };
}

function isRenderableImageReference(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("data:image/")
  );
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  return "Product storage is unavailable. Open the app through Tauri to use local SQLite.";
}
