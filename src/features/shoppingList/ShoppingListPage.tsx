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
import { Badge, DataTable, MetricPanel, Panel, ToolbarButton } from "@/components/ui";
import {
  addOnsRepository,
  hueForgeRepository,
  shoppingListRepository,
} from "@/data/repositories";
import { formatQuantity, type AddOnRecord } from "@/domain/inventory";
import {
  buildLowStockAddOnSuggestions,
  buildMissingHueForgeFilamentSuggestions,
  mergeShoppingSuggestions,
  SHOPPING_ITEM_CATEGORIES,
  SHOPPING_ITEM_PRIORITIES,
  toManualShoppingItemInput,
  validateShoppingListItemInput,
  type HueForgeMissingRequirement,
  type ShoppingItemCategory,
  type ShoppingItemPriority,
  type ShoppingListItemInput,
  type ShoppingListItemRecord,
  type ShoppingSuggestion,
} from "@/domain/shopping";

interface ShoppingFormState {
  readonly category: ShoppingItemCategory;
  readonly itemName: string;
  readonly notes: string;
  readonly priority: ShoppingItemPriority;
  readonly quantityNeeded: string;
  readonly sourceNote: string;
  readonly unit: string;
}

const emptyForm: ShoppingFormState = {
  category: "Hardware",
  itemName: "",
  notes: "",
  priority: "normal",
  quantityNeeded: "1",
  sourceNote: "Manual entry",
  unit: "pcs",
};

export function ShoppingListPage() {
  const [addOns, setAddOns] = useState<AddOnRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ShoppingFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState<ShoppingListItemRecord[]>([]);
  const [missingRequirements, setMissingRequirements] = useState<HueForgeMissingRequirement[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadShoppingData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedItems, loadedAddOns, loadedRequirements] = await Promise.all([
        shoppingListRepository.list(),
        addOnsRepository.list(),
        hueForgeRepository.listMissingRequirements(),
      ]);

      setItems(loadedItems);
      setAddOns(loadedAddOns);
      setMissingRequirements(loadedRequirements);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadShoppingData();
  }, []);

  const input = useMemo(() => toShoppingListItemInput(form), [form]);
  const validation = validateShoppingListItemInput(input);
  const suggestions = useMemo(
    () =>
      mergeShoppingSuggestions([
        ...buildLowStockAddOnSuggestions(addOns),
        ...buildMissingHueForgeFilamentSuggestions(missingRequirements),
      ]),
    [addOns, missingRequirements],
  );
  const openItems = items.filter((item) => item.status === "open");
  const highPriority = openItems.filter((item) => item.priority === "high");
  const generatedCount = suggestions.length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the shopping item fields.");
      return;
    }

    await saveShoppingItem(input, "Shopping item saved.");
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
      setForm(emptyForm);
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

  return (
    <Page
      actions={
        <>
          <ToolbarButton onClick={() => void loadShoppingData()}>Refresh</ToolbarButton>
          <ToolbarButton disabled={isSaving} form="shopping-list-form" tone="primary" type="submit">
            Add Item
          </ToolbarButton>
        </>
      }
      description="Plan manual purchases and review generated, explainable suggestions from low-stock add-ons and missing HueForge filament requirements."
      meta={["Manual purchasing", "Generated suggestions", "No ordering APIs"]}
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

      <div className="metric-grid">
        <MetricPanel detail="status open" label="Open Items" value={isLoading ? "..." : String(openItems.length)} />
        <MetricPanel detail="manual list" label="High Priority" tone={highPriority.length > 0 ? "warning" : "success"} value={String(highPriority.length)} />
        <MetricPanel detail="not auto-added" label="Suggestions" value={String(generatedCount)} />
        <MetricPanel detail="external APIs" label="Ordering" tone="success" value="Manual" />
      </div>

      <div className="content-grid content-grid--costing">
        <div className="side-stack">
          <Panel title="Manual Shopping List" actions={<Badge>{items.length} items</Badge>}>
            <DataTable
              columns={["Item", "Category", "Qty", "Priority", "Status", "Actions"]}
              columnsTemplate="minmax(170px, 1.3fr) 0.7fr 0.62fr 0.55fr 0.58fr 0.9fr"
              density="dense"
              footer={items.length === 0 ? "No manual shopping list items saved yet." : "Shopping list items are local planning records only."}
              rows={items.map((item) => [
                item.itemName,
                <Badge>{item.category}</Badge>,
                formatQuantity(item.quantityNeeded, item.unit),
                <Badge tone={item.priority === "high" ? "warning" : "neutral"}>{item.priority}</Badge>,
                <Badge tone={item.status === "open" ? "success" : "neutral"}>{item.status}</Badge>,
                item.status === "open" ? (
                  <span className="table-actions">
                    <button disabled={isSaving} onClick={() => void updateStatus(item.id, "purchased")} type="button">
                      Bought
                    </button>
                    <button disabled={isSaving} onClick={() => void updateStatus(item.id, "ignored")} type="button">
                      Ignore
                    </button>
                  </span>
                ) : (
                  "--"
                ),
              ])}
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
                  <div className="suggestion-list__item" key={`${suggestion.sourceType}-${suggestion.itemName}-${index}`}>
                    <div>
                      <Badge tone={suggestion.priority === "high" ? "warning" : "neutral"}>
                        {suggestion.priority}
                      </Badge>
                      <strong>{suggestion.itemName}</strong>
                      <span>{formatQuantity(suggestion.quantityNeeded, suggestion.unit)}</span>
                    </div>
                    <p>{suggestion.reason}</p>
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
          <Panel title="Add Manual Item">
            <form className="inventory-form" id="shopping-list-form" onSubmit={(event) => void handleSubmit(event)}>
              <FormField label="Item Name" wide>
                <input onChange={(event) => setFormValue("itemName", event.target.value, setForm)} value={form.itemName} />
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
              <FormField label="Priority">
                <select onChange={(event) => setFormValue("priority", event.target.value as ShoppingItemPriority, setForm)} value={form.priority}>
                  {SHOPPING_ITEM_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Quantity">
                <input inputMode="decimal" onChange={(event) => setFormValue("quantityNeeded", event.target.value, setForm)} value={form.quantityNeeded} />
              </FormField>
              <FormField label="Unit">
                <input onChange={(event) => setFormValue("unit", event.target.value, setForm)} value={form.unit} />
              </FormField>
              <FormField label="Source Note" wide>
                <input onChange={(event) => setFormValue("sourceNote", event.target.value, setForm)} value={form.sourceNote} />
              </FormField>
              <FormField label="Notes" wide>
                <textarea onChange={(event) => setFormValue("notes", event.target.value, setForm)} value={form.notes} />
              </FormField>
              <div className="form-actions">
                <ToolbarButton disabled={isSaving} tone="primary" type="submit">
                  Save Shopping Item
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
    priority: form.priority,
    quantityNeeded: Number(form.quantityNeeded.trim() || "0"),
    sourceNote: form.sourceNote,
    sourceType: "manual",
    status: "open",
    unit: form.unit,
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
