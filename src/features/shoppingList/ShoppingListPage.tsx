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
import { Badge, DataTable, Panel, ProductDesignCombobox, ToolbarButton } from "@/components/ui";
import {
  addOnsRepository,
  hueForgeRepository,
  productsRepository,
  shoppingListRepository,
} from "@/data/repositories";
import { formatQuantity, type AddOnRecord } from "@/domain/inventory";
import type { ProductRecord } from "@/domain/products";
import {
  buildLowStockAddOnSuggestions,
  buildMissingHueForgeFilamentSuggestions,
  mergeShoppingSuggestions,
  SHOPPING_ITEM_CATEGORIES,
  toManualShoppingItemInput,
  validateShoppingListItemInput,
  type HueForgeMissingRequirement,
  type ShoppingItemCategory,
  type ShoppingListItemInput,
  type ShoppingListItemRecord,
  type ShoppingSuggestion,
} from "@/domain/shopping";

interface ShoppingFormState {
  readonly category: ShoppingItemCategory;
  readonly itemName: string;
  readonly notes: string;
  readonly productId: string;
  readonly sourceNote: string;
}

const emptyForm: ShoppingFormState = {
  category: "Hardware",
  itemName: "",
  notes: "",
  productId: "",
  sourceNote: "Manual entry",
};

export function ShoppingListPage() {
  const [addOns, setAddOns] = useState<AddOnRecord[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ShoppingFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState<ShoppingListItemRecord[]>([]);
  const [missingRequirements, setMissingRequirements] = useState<HueForgeMissingRequirement[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadShoppingData(): Promise<void> {
    setError(null);

    try {
      const [loadedItems, loadedAddOns, loadedRequirements, loadedProducts] = await Promise.all([
        shoppingListRepository.list(),
        addOnsRepository.list(),
        hueForgeRepository.listMissingRequirements(),
        productsRepository.list(),
      ]);

      setItems(loadedItems);
      setAddOns(loadedAddOns);
      setMissingRequirements(loadedRequirements);
      setProducts(loadedProducts);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    }
  }

  useEffect(() => {
    void loadShoppingData();
  }, []);

  const input = useMemo(() => toShoppingListItemInput(form), [form]);
  const validation = validateShoppingListItemInput(input);
  const productNames = useMemo(
    () => new Map(products.map((product) => [product.id, product.designName] as const)),
    [products],
  );
  const suggestions = useMemo(
    () =>
      mergeShoppingSuggestions([
        ...buildLowStockAddOnSuggestions(addOns),
        ...buildMissingHueForgeFilamentSuggestions(missingRequirements),
      ]),
    [addOns, missingRequirements],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the shopping item fields.");
      return;
    }

    if (editingId == null) {
      await saveShoppingItem(input, "Shopping item saved.");
      return;
    }

    await updateShoppingItem(editingId, input);
  }

  async function handleAddSuggestion(suggestion: ShoppingSuggestion): Promise<void> {
    await saveShoppingItem(toManualShoppingItemInput(suggestion), "Generated suggestion added to the manual shopping list.");
  }

  async function saveShoppingItem(item: ShoppingListItemInput, successMessage: string): Promise<void> {
    setIsSaving(true);
    setError(null);
    setValidationMessage(null);

    try {
      await shoppingListRepository.create(item);
      await loadShoppingData();
      setValidationMessage(successMessage);
      resetForm();
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function updateShoppingItem(itemId: number, item: ShoppingListItemInput): Promise<void> {
    setIsSaving(true);
    setError(null);
    setValidationMessage(null);

    try {
      await shoppingListRepository.update(itemId, item);
      await loadShoppingData();
      setValidationMessage("Shopping item updated.");
      resetForm();
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(itemId: number, status: "purchased" | "ignored"): Promise<void> {
    setIsSaving(true);
    setError(null);

    try {
      await shoppingListRepository.updateStatus(itemId, status);
      await loadShoppingData();
    } catch (statusError) {
      setError(formatRepositoryError(statusError));
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(item: ShoppingListItemRecord): void {
    setEditingId(item.id);
    setValidationMessage(null);
    setForm(toFormState(item));
  }

  function resetForm(): void {
    setEditingId(null);
    setForm(emptyForm);
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton onClick={() => void loadShoppingData()}>Refresh</ToolbarButton>
          <ToolbarButton disabled={isSaving} form="shopping-list-form" tone="primary" type="submit">
            {editingId == null ? "Add Item" : "Update Item"}
          </ToolbarButton>
        </>
      }
      meta={[]}
      title="Shopping List"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}
      {validationMessage ? (
        <div className={validationMessage.includes("saved") || validationMessage.includes("added") ? "callout" : "callout callout--warning"}>
          <Badge tone={validationMessage.includes("saved") || validationMessage.includes("added") ? "success" : "warning"}>
            Shopping
          </Badge>
          <p>{validationMessage}</p>
        </div>
      ) : null}

      <div className="content-grid content-grid--costing">
        <div className="side-stack">
          <Panel title="Manual Shopping List" actions={<Badge>{items.length} items</Badge>}>
            <DataTable
              columns={["Item", "Product / Design", "Category", "Status", "Actions"]}
              columnsTemplate="minmax(170px, 1.25fr) minmax(150px, 1fr) 0.7fr 0.55fr 0.9fr"
              density="dense"
              footer={items.length === 0 ? "No manual shopping list items saved yet." : "Shopping list items are local planning records only."}
              onRowClick={(rowIndex) => {
                const item = items[rowIndex];

                if (item) {
                  startEdit(item);
                }
              }}
              rows={items.map((item) => [
                item.itemName,
                item.productId ? productNames.get(item.productId) ?? `Product ${item.productId}` : "--",
                <Badge>{item.category}</Badge>,
                <Badge tone={item.status === "open" ? "success" : "neutral"}>{item.status}</Badge>,
                item.status === "open" ? (
                  <span className="table-actions">
                    <button
                      disabled={isSaving}
                      onClick={(event) => {
                        event.stopPropagation();
                        void updateStatus(item.id, "purchased");
                      }}
                      type="button"
                    >
                      Bought
                    </button>
                    <button
                      disabled={isSaving}
                      onClick={(event) => {
                        event.stopPropagation();
                        void updateStatus(item.id, "ignored");
                      }}
                      type="button"
                    >
                      Ignore
                    </button>
                  </span>
                ) : (
                  "--"
                ),
              ])}
              selectedRowIndex={items.findIndex((item) => item.id === editingId)}
            />
          </Panel>

          <Panel title="Generated Suggestions" actions={<Badge tone={suggestions.length > 0 ? "warning" : "success"}>{suggestions.length}</Badge>}>
            {suggestions.length === 0 ? (
              <div className="empty-state">
                <p>No generated shopping suggestions right now.</p>
              </div>
            ) : (
              <div className="suggestion-list">
                {suggestions.map((suggestion, index) => (
                  <div className="suggestion-list__item" key={`${suggestion.sourceType}-${suggestion.productId ?? "none"}-${suggestion.itemName}-${index}`}>
                    <div>
                      <strong>{suggestion.itemName}</strong>
                      <span>{formatQuantity(suggestion.quantityNeeded, suggestion.unit)}</span>
                    </div>
                    <p>{suggestion.reason}</p>
                    {suggestion.productId ? (
                      <small>{productNames.get(suggestion.productId) ?? `Product ${suggestion.productId}`}</small>
                    ) : null}
                    <small>{suggestion.sourceNote}</small>
                    <ToolbarButton disabled={isSaving} onClick={() => void handleAddSuggestion(suggestion)}>
                      Add
                    </ToolbarButton>
                  </div>
                ))}
              </div>
            )}
            <div className="callout callout--warning">
              <Badge tone="warning">Non-destructive</Badge>
              <p>Suggestions do not change inventory or place orders. Add them manually if you want to track them.</p>
            </div>
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title={editingId == null ? "Add Manual Item" : "Update Shopping Item"}>
            <form className="inventory-form" id="shopping-list-form" onSubmit={(event) => void handleSubmit(event)}>
              <FormField label="Item Name" wide>
                <input onChange={(event) => setFormValue("itemName", event.target.value, setForm)} value={form.itemName} />
              </FormField>
              <FormField label="Product / Design" wide>
                <ProductDesignCombobox
                  fallbackLabel={form.productId ? productNames.get(Number(form.productId)) ?? "" : ""}
                  onSelect={(product) => setFormValue("productId", product ? String(product.id) : "", setForm)}
                  products={products}
                  selectedProductId={form.productId}
                />
              </FormField>
              <FormField label="Category">
                <select onChange={(event) => setFormValue("category", event.target.value as ShoppingItemCategory, setForm)} value={form.category}>
                  {SHOPPING_ITEM_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Source Note" wide>
                <input onChange={(event) => setFormValue("sourceNote", event.target.value, setForm)} value={form.sourceNote} />
              </FormField>
              <FormField label="Notes" wide>
                <textarea onChange={(event) => setFormValue("notes", event.target.value, setForm)} value={form.notes} />
              </FormField>
              <div className="form-actions">
                {editingId == null ? null : (
                  <ToolbarButton disabled={isSaving} onClick={resetForm} tone="ghost" type="button">
                    Cancel
                  </ToolbarButton>
                )}
                <ToolbarButton disabled={isSaving} tone="primary" type="submit">
                  {editingId == null ? "Save Shopping Item" : "Update Shopping Item"}
                </ToolbarButton>
              </div>
            </form>
          </Panel>
        </div>
      </div>
    </Page>
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

function setFormValue<K extends keyof ShoppingFormState>(
  key: K,
  value: ShoppingFormState[K],
  setForm: Dispatch<SetStateAction<ShoppingFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function toShoppingListItemInput(form: ShoppingFormState): ShoppingListItemInput {
  return {
    category: form.category,
    itemName: form.itemName,
    notes: form.notes,
    priority: "normal",
    productId: form.productId ? Number(form.productId) : null,
    quantityNeeded: 1,
    sourceNote: form.sourceNote,
    sourceType: "manual",
    status: "open",
    unit: "pcs",
  };
}

function toFormState(item: ShoppingListItemRecord): ShoppingFormState {
  return {
    category: item.category,
    itemName: item.itemName,
    notes: item.notes,
    productId: item.productId ? String(item.productId) : "",
    sourceNote: item.sourceNote,
  };
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  return "Shopping list storage is unavailable. Open the app through Tauri to use local SQLite.";
}
