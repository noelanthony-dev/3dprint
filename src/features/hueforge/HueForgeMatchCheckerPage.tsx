import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  ProgressBar,
  Swatch,
  ToolbarButton,
} from "@/components/ui";
import { filamentRepository, hueForgeRepository, productsRepository, shoppingListRepository } from "@/data/repositories";
import {
  FILAMENT_MATERIALS,
  formatGramsLeft,
  normalizeHexColor,
  type FilamentMaterial,
  type FilamentRecord,
} from "@/domain/inventory";
import {
  analyzeHueForgeMatches,
  formatHueForgeColorFamily,
  validateHueForgeRequirement,
  type HueForgeFeasibilityStatus,
  type HueForgeMatchStatus,
  type HueForgeRequirementInput,
} from "@/domain/hueforge";
import type { ProductCategory } from "@/domain/products";
import type { ShoppingListItemInput } from "@/domain/shopping";

interface DesignFormState {
  readonly authorName: string;
  readonly category: ProductCategory;
  readonly designName: string;
  readonly imageReference: string;
  readonly notes: string;
  readonly saleUnit: "piece" | "pair" | "set" | "bundle" | "pack";
  readonly sourceLink: string;
}

interface RequirementFormState {
  readonly brand: string;
  readonly colorName: string;
  readonly hexColor: string;
  readonly materialType: FilamentMaterial;
  readonly requiredGrams: string;
  readonly transmissionDistance: string;
}

const emptyRequirement: RequirementFormState = {
  brand: "",
  colorName: "",
  hexColor: "#ffffff",
  materialType: "PLA",
  requiredGrams: "0",
  transmissionDistance: "0",
};

const initialDesignForm: DesignFormState = {
  authorName: "NeonPrints3D",
  category: "Bookmarks",
  designName: "Cyberpunk Cityscape",
  imageReference: "",
  notes: "Requires author filament matching review. Test-print before production if shade or light pass-through warnings appear.",
  saleUnit: "piece",
  sourceLink: "https://example.com/hueforge/cyberpunk-cityscape",
};

const initialRequirements: RequirementFormState[] = [
  {
    brand: "Bambu PLA Basic",
    colorName: "Black",
    hexColor: "#1a1a1a",
    materialType: "PLA",
    requiredGrams: "15.2",
    transmissionDistance: "0.6",
  },
  {
    brand: "Polymaker PolyLite",
    colorName: "Purple",
    hexColor: "#8a2be2",
    materialType: "PLA",
    requiredGrams: "8.5",
    transmissionDistance: "2.4",
  },
  {
    brand: "eSun PLA+",
    colorName: "Magenta",
    hexColor: "#ff1493",
    materialType: "PLA+",
    requiredGrams: "4.2",
    transmissionDistance: "4.1",
  },
  {
    brand: "Sunlu PLA",
    colorName: "Cyan",
    hexColor: "#00ffff",
    materialType: "PLA",
    requiredGrams: "2.1",
    transmissionDistance: "6.8",
  },
];

const matchTone: Record<HueForgeMatchStatus, "neutral" | "success" | "warning" | "danger"> = {
  excellent: "success",
  good: "success",
  missing: "danger",
  test: "warning",
};

const feasibilityTone: Record<HueForgeFeasibilityStatus, "success" | "warning" | "danger"> = {
  missing: "danger",
  "needs-test": "warning",
  ready: "success",
};

const hexColorPattern = /^#[0-9a-f]{6}$/i;
type HueForgeMatchView = ReturnType<typeof analyzeHueForgeMatches>["matches"][number];

interface MatchMetric {
  readonly detail?: string;
  readonly label: string;
  readonly tone: "neutral" | "warning" | "danger";
  readonly value: string;
}

export function HueForgeMatchCheckerPage() {
  const [designForm, setDesignForm] = useState<DesignFormState>(initialDesignForm);
  const [error, setError] = useState<string | null>(null);
  const [filaments, setFilaments] = useState<FilamentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [requirements, setRequirements] = useState<RequirementFormState[]>(initialRequirements);
  const [shoppingListKeys, setShoppingListKeys] = useState<ReadonlySet<string>>(new Set());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadFilaments(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await filamentRepository.list();
      setFilaments(loaded);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadFilaments();
  }, []);

  const parsedRequirements = useMemo(
    () => requirements.map(toRequirementInput),
    [requirements],
  );
  const analysis = useMemo(
    () => analyzeHueForgeMatches(parsedRequirements, filaments),
    [filaments, parsedRequirements],
  );

  function addRequirement(): void {
    setRequirements((current) => [...current, emptyRequirement]);
  }

  function removeRequirement(index: number): void {
    setRequirements((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSaveToDesignLibrary(): Promise<void> {
    setSaveMessage(null);
    setValidationMessage(null);

    for (const requirement of parsedRequirements) {
      const validation = validateHueForgeRequirement(requirement);

      if (!validation.valid) {
        setValidationMessage(formatPlainHueForgeCopy(Object.values(validation.errors)[0] ?? "Check the requirement fields."));
        return;
      }
    }

    if (!designForm.designName.trim() || !designForm.authorName.trim() || !designForm.sourceLink.trim()) {
      setValidationMessage("Design name, author, and source link are required before saving.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const product = await productsRepository.create({
        authorName: designForm.authorName,
        category: designForm.category,
        commercialLicenseStatus: "unknown",
        designName: designForm.designName,
        filamentMode: "hueforge",
        hueForgeFilaments: parsedRequirements.map((requirement) => ({
          alternativeFilamentIds: [],
          brand: requirement.brand,
          colorName: requirement.colorName,
          hexColor: requirement.hexColor,
          layerRange: requirement.layerRange,
          materialType: requirement.materialType,
          purchaseSource: "",
          requiredGrams: requirement.requiredGrams,
          role: requirement.role,
          transmissionDistance: requirement.transmissionDistance,
        })),
        imageReference: designForm.imageReference,
        licenseBillingInterval: "none",
        licenseCostAmount: 0,
        notes: `${designForm.notes}\n\n${analysis.feasibilityNotes}`.trim(),
        saleUnit: designForm.saleUnit,
        sourceLink: designForm.sourceLink,
      });

      await hueForgeRepository.saveAnalysis({
        feasibilityNotes: analysis.feasibilityNotes,
        feasibilityStatus: analysis.feasibilityStatus,
        matches: analysis.matches,
        missingWarnings: analysis.missingWarnings,
        productId: product.id,
      });

      setSaveMessage(`Saved ${product.designName} to Design Library without deducting inventory.`);
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddToShoppingList(match: HueForgeMatchView): Promise<void> {
    const shoppingKey = getShoppingListKey(match);

    setSaveMessage(null);
    setValidationMessage(null);
    setIsSaving(true);
    setError(null);

    try {
      const item = await shoppingListRepository.create(toShoppingListItem(match, designForm));

      setShoppingListKeys((current) => new Set(current).add(shoppingKey));
      setSaveMessage(`Added ${item.itemName} to the Shopping List.`);
    } catch (shoppingError) {
      setError(formatRepositoryError(shoppingError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton onClick={() => void loadFilaments()}>Refresh Inventory</ToolbarButton>
          <ToolbarButton disabled={isSaving} onClick={() => void handleSaveToDesignLibrary()} tone="primary">
            Add to Design Library
          </ToolbarButton>
        </>
      }
      description="Compare author HueForge requirements against owned filament by color family, shade closeness, light pass-through, material, and stock availability."
      meta={["Color-safe matching", "Shade scoring", "No inventory deduction"]}
      title="HueForge Match Checker"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}
      {validationMessage ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Validation</Badge>
          <p>{validationMessage}</p>
        </div>
      ) : null}
      {saveMessage ? (
        <div className="callout">
          <Badge tone="success">Saved</Badge>
          <p>{saveMessage}</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel detail="owned spools loaded" label="Inventory" value={isLoading ? "..." : String(filaments.length)} />
        <MetricPanel detail="author colors" label="Requirements" value={String(requirements.length)} />
        <MetricPanel detail="temporary heuristic" label="Avg. Match" value={`${analysis.averageScore}%`} />
        <MetricPanel
          detail="no stock movement"
          label="Feasibility"
          tone={feasibilityTone[analysis.feasibilityStatus]}
          value={analysis.feasibilityStatus}
        />
      </div>

      <div className="content-grid content-grid--hueforge">
        <Panel title="Design Input">
          <div className="inventory-form">
            <FormField label="Design Name" wide>
              <input
                onChange={(event) =>
                  setDesignValue("designName", event.target.value, setDesignForm)
                }
                value={designForm.designName}
              />
            </FormField>
            <FormField label="Author" wide>
              <input
                onChange={(event) =>
                  setDesignValue("authorName", event.target.value, setDesignForm)
                }
                value={designForm.authorName}
              />
            </FormField>
            <FormField label="Source Link" wide>
              <input
                onChange={(event) =>
                  setDesignValue("sourceLink", event.target.value, setDesignForm)
                }
                value={designForm.sourceLink}
              />
            </FormField>
            <FormField label="Image Ref" wide>
              <input
                onChange={(event) =>
                  setDesignValue("imageReference", event.target.value, setDesignForm)
                }
                value={designForm.imageReference}
              />
            </FormField>
            <FormField label="Notes" wide>
              <textarea
                onChange={(event) => setDesignValue("notes", event.target.value, setDesignForm)}
                value={designForm.notes}
              />
            </FormField>
          </div>
        </Panel>

        <Panel
          actions={
            <ToolbarButton onClick={addRequirement} tone="ghost">
              Add Color
            </ToolbarButton>
          }
          title="Required Filaments"
        >
          <DataTable
            columns={["Brand / Color", "Mat", "Light", "g", ""]}
            columnsTemplate="minmax(190px, 1.6fr) 0.48fr 0.42fr 0.42fr 34px"
            density="dense"
            footer={`${requirements.length} author requirements. Wrong color families are rejected before light pass-through ranking.`}
            rows={requirements.map((requirement, index) => [
              <span className="table-field-stack">
                <input
                  aria-label={`Brand ${index + 1}`}
                  className="table-input"
                  onChange={(event) =>
                    setRequirementValue(index, "brand", event.target.value, setRequirements)
                  }
                  value={requirement.brand}
                />
                <span className="required-color-row">
                  <input
                    aria-label={`Color ${index + 1}`}
                    className="table-input"
                    onChange={(event) =>
                      setRequirementValue(index, "colorName", event.target.value, setRequirements)
                    }
                    value={requirement.colorName}
                  />
                  <input
                    aria-label={`Hex ${index + 1}`}
                    className="table-input table-input--short"
                    onBlur={() =>
                      setRequirementValue(
                        index,
                        "hexColor",
                        normalizeHexColor(requirement.hexColor),
                        setRequirements,
                      )
                    }
                    onChange={(event) =>
                      setRequirementValue(index, "hexColor", event.target.value, setRequirements)
                    }
                    value={requirement.hexColor}
                  />
                  <span
                    aria-label={`Hex preview ${index + 1}: ${normalizeHexColor(requirement.hexColor)}`}
                    className="required-hex-preview"
                    data-valid={isValidHexColor(requirement.hexColor) ? "true" : "false"}
                    role="img"
                    style={{ backgroundColor: getPreviewHexColor(requirement.hexColor) }}
                    title={normalizeHexColor(requirement.hexColor)}
                  />
                </span>
              </span>,
              <select
                aria-label={`Material ${index + 1}`}
                className="table-input"
                onChange={(event) =>
                  setRequirementValue(
                    index,
                    "materialType",
                    event.target.value as FilamentMaterial,
                    setRequirements,
                  )
                }
                value={requirement.materialType}
              >
                {FILAMENT_MATERIALS.map((material) => (
                  <option key={material} value={material}>
                    {material}
                  </option>
                ))}
              </select>,
              <input
                aria-label={`Light pass-through ${index + 1}`}
                className="table-input"
                inputMode="decimal"
                onChange={(event) =>
                  setRequirementValue(index, "transmissionDistance", event.target.value, setRequirements)
                }
                value={requirement.transmissionDistance}
              />,
              <input
                aria-label={`Required grams ${index + 1}`}
                className="table-input"
                inputMode="decimal"
                onChange={(event) =>
                  setRequirementValue(index, "requiredGrams", event.target.value, setRequirements)
                }
                value={requirement.requiredGrams}
              />,
              <button className="table-link" onClick={() => removeRequirement(index)} type="button">
                x
              </button>,
            ])}
          />
        </Panel>

        <Panel title="Inventory Matches" actions={<Badge tone={feasibilityTone[analysis.feasibilityStatus]}>{analysis.feasibilityStatus}</Badge>}>
          <div className="match-list">
            {analysis.matches.map((match, index) => {
              const warningCopy = getMatchWarningCopy(match);
              const shoppingKey = getShoppingListKey(match);
              const canAddShoppingItem = shouldShowShoppingListAction(match);
              const wasAddedToShoppingList = shoppingListKeys.has(shoppingKey);

              return (
                <div className="match-card" data-status={match.status} key={`${match.requirement.colorName}-${index}`}>
                  <div className="match-card__header">
                    <Swatch
                      color={getPreviewHexColor(match.requirement.hexColor)}
                      label={`${match.requirement.colorName} (${formatHueForgeColorFamily(match.requiredColorFamily)})`}
                    />
                    <Badge tone={matchTone[match.status]}>{formatMatchStatusLabel(match)}</Badge>
                  </div>

                  <div className="match-card__flow">
                    <span className="match-card__arrow">-&gt;</span>
                    {match.matchedFilament ? (
                      <Swatch
                        color={match.matchedFilament.hexColor}
                        label={`${match.matchedFilament.brand} ${match.matchedFilament.name} (${formatHueForgeColorFamily(match.matchedColorFamily ?? "unknown")})`}
                      />
                    ) : (
                      <span className="match-card__missing">Missing Close Color</span>
                    )}
                  </div>

                  <div className="match-card__metrics">
                    {getPrimaryMatchMetrics(match).map((metric) => (
                      <span className="match-metric" data-tone={metric.tone} key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                        {metric.detail ? <small>{metric.detail}</small> : null}
                      </span>
                    ))}
                  </div>

                  <div className="match-card__metric-section">
                    <span className="match-card__metric-section-label">Light pass-through</span>
                    <div className="match-card__metrics">
                      {getLightMatchMetrics(match).map((metric) => (
                        <span className="match-metric" data-tone={metric.tone} key={metric.label}>
                          <span>{metric.label}</span>
                          <strong>{metric.value}</strong>
                          {metric.detail ? <small>{metric.detail}</small> : null}
                        </span>
                      ))}
                    </div>
                  </div>

                  {warningCopy ? (
                    <p className="match-card__warning">
                      {warningCopy}
                    </p>
                  ) : null}

                  {canAddShoppingItem ? (
                    <div className="match-card__actions">
                      <button
                        className="match-card__shopping-action"
                        disabled={isSaving || wasAddedToShoppingList}
                        onClick={() => void handleAddToShoppingList(match)}
                        type="button"
                      >
                        {wasAddedToShoppingList ? "Added to Shopping List" : "Add required color to Shopping List"}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Feasibility Note">
        <div className={analysis.feasibilityStatus === "ready" ? "callout" : "callout callout--warning"}>
          <Badge tone={feasibilityTone[analysis.feasibilityStatus]}>
            {analysis.feasibilityStatus}
          </Badge>
          <p>{formatPlainHueForgeCopy(analysis.feasibilityNotes)}</p>
        </div>
        {analysis.missingWarnings.length > 0 ? (
          <div className="status-grid hueforge-warning-grid">
            {analysis.missingWarnings.map((warning) => (
              <span key={warning}>
                {formatPlainHueForgeCopy(warning)}
                <Badge tone="warning">review</Badge>
              </span>
            ))}
          </div>
        ) : null}
      </Panel>
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

function setDesignValue<K extends keyof DesignFormState>(
  key: K,
  value: DesignFormState[K],
  setForm: Dispatch<SetStateAction<DesignFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function setRequirementValue<K extends keyof RequirementFormState>(
  index: number,
  key: K,
  value: RequirementFormState[K],
  setForm: Dispatch<SetStateAction<RequirementFormState[]>>,
): void {
  setForm((current) =>
    current.map((requirement, currentIndex) =>
      currentIndex === index ? { ...requirement, [key]: value } : requirement,
    ),
  );
}

function toRequirementInput(form: RequirementFormState, index: number): HueForgeRequirementInput {
  return {
    brand: form.brand,
    colorName: form.colorName,
    hexColor: normalizeHexColor(form.hexColor),
    layerRange: "",
    materialType: form.materialType,
    requiredGrams: Number(form.requiredGrams),
    role: `Color ${index + 1}`,
    transmissionDistance: parseOptionalDecimal(form.transmissionDistance),
  };
}

function getPreviewHexColor(value: string): string {
  const normalized = normalizeHexColor(value);

  return hexColorPattern.test(normalized) ? normalized : "transparent";
}

function isValidHexColor(value: string): boolean {
  return hexColorPattern.test(normalizeHexColor(value));
}

function parseOptionalDecimal(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatMatchStatusLabel(match: HueForgeMatchView): string {
  if (match.status === "missing" && match.rejectionReason.includes("Needs Hex Input")) {
    return "needs hex";
  }

  return match.status;
}

function shouldShowShoppingListAction(match: HueForgeMatchView): boolean {
  return match.deltaE != null && match.deltaE > 6;
}

function getShoppingListKey(match: HueForgeMatchView): string {
  const requirement = match.requirement;

  return [
    requirement.brand.trim().toLowerCase(),
    requirement.colorName.trim().toLowerCase(),
    requirement.materialType.toLowerCase(),
    normalizeHexColor(requirement.hexColor).toLowerCase(),
  ].join(":");
}

function toShoppingListItem(
  match: HueForgeMatchView,
  designForm: DesignFormState,
): ShoppingListItemInput {
  const requirement = match.requirement;
  const quantityNeeded = Number.isFinite(requirement.requiredGrams)
    ? Math.max(1, requirement.requiredGrams)
    : 1;
  const colorScore = match.deltaE == null ? "unknown" : match.deltaE.toFixed(1);
  const colorStatus = formatColorClosenessValue(match);
  const designName = designForm.designName.trim() || "HueForge design";
  const authorName = designForm.authorName.trim();

  return {
    category: "Filament",
    itemName: `${requirement.brand} ${requirement.colorName} ${requirement.materialType}`.trim(),
    notes: `Required color is ${colorStatus} against owned inventory. Color closeness score ${colorScore}.`,
    priority: "high",
    quantityNeeded,
    sourceNote: `${designName}${authorName ? ` by ${authorName}` : ""}; required light pass-through ${formatLightValue(requirement.transmissionDistance, "not entered")}; ${normalizeHexColor(requirement.hexColor)}.`,
    sourceType: "missing-hueforge-filament",
    status: "open",
    unit: "grams",
  };
}

function getPrimaryMatchMetrics(match: HueForgeMatchView): MatchMetric[] {
  return [
    {
      detail: formatColorClosenessDetail(match.deltaE),
      label: "Color closeness",
      tone: getDeltaMetricTone(match),
      value: formatColorClosenessValue(match),
    },
    {
      label: "Stock",
      tone: getStockMetricTone(match),
      value: formatStockValue(match),
    },
  ];
}

function getLightMatchMetrics(match: HueForgeMatchView): MatchMetric[] {
  return [
    {
      label: "Design needs",
      tone: match.requirement.transmissionDistance == null ? "warning" : "neutral",
      value: formatLightValue(match.requirement.transmissionDistance, "add value"),
    },
    {
      label: "Filament has",
      tone: match.matchedFilament?.transmissionDistance == null ? "warning" : "neutral",
      value: formatLightValue(match.matchedFilament?.transmissionDistance ?? null, "missing"),
    },
    {
      detail: formatLightDifferenceDetail(match.tdDelta),
      label: "Difference",
      tone: getLightDifferenceMetricTone(match),
      value: formatLightDifferenceValue(match),
    },
  ];
}

function getMatchWarningCopy(match: HueForgeMatchView): string {
  return formatPlainHueForgeCopy(match.rejectionReason || match.warning);
}

function formatColorClosenessValue(match: HueForgeMatchView): string {
  if (match.deltaE == null) {
    return "unknown";
  }

  if (match.status === "missing" || match.deltaE > 10) {
    return "too different";
  }

  if (match.deltaE > 6) {
    return "test first";
  }

  if (match.deltaE > 3) {
    return "good";
  }

  return "excellent";
}

function formatColorClosenessDetail(deltaE: number | null): string {
  return deltaE == null ? "no color score" : `score ${deltaE.toFixed(1)}`;
}

function formatLightDifferenceValue(match: HueForgeMatchView): string {
  if (match.tdDelta == null) {
    return match.requirement.transmissionDistance == null || match.matchedFilament?.transmissionDistance == null
      ? "unknown"
      : "not needed";
  }

  if (match.tdDelta > 1.5) {
    return "far off";
  }

  if (match.tdDelta > 1) {
    return "usable";
  }

  return "close";
}

function formatLightDifferenceDetail(tdDelta: number | null): string {
  return tdDelta == null ? "no comparison" : `by ${tdDelta.toFixed(1)}`;
}

function formatLightValue(value: number | null, emptyLabel: string): string {
  return value == null ? emptyLabel : value.toFixed(1);
}

function formatStockValue(match: HueForgeMatchView): string {
  return match.matchedFilament ? formatGramsLeft(match.matchedFilament.estimatedGramsLeft) : "none";
}

function getDeltaMetricTone(match: HueForgeMatchView): MatchMetric["tone"] {
  if (match.deltaE == null) {
    return "warning";
  }

  if (match.status === "missing" || match.deltaE > 10) {
    return "danger";
  }

  if (match.deltaE > 6) {
    return "warning";
  }

  return "neutral";
}

function getLightDifferenceMetricTone(match: HueForgeMatchView): MatchMetric["tone"] {
  if (match.tdDelta == null) {
    return match.requirement.transmissionDistance == null || match.matchedFilament?.transmissionDistance == null
      ? "warning"
      : "neutral";
  }

  return match.tdDelta > 1.5 ? "warning" : "neutral";
}

function getStockMetricTone(match: HueForgeMatchView): MatchMetric["tone"] {
  if (!match.matchedFilament) {
    return "danger";
  }

  if (
    match.stockSignal === "missing" ||
    match.stockSignal === "empty" ||
    match.stockSignal === "archived" ||
    match.matchedFilament.estimatedGramsLeft < match.requirement.requiredGrams
  ) {
    return "danger";
  }

  return match.stockSignal === "low" ? "warning" : "neutral";
}

function formatPlainHueForgeCopy(copy: string): string {
  return copy
    .replace(/(.+?) TD variance is [\d.]+; test before production\./g, "$1 light pass-through is far from the design; test before production.")
    .replace(/(.+?) Delta E is [\d.]+; test before production\./g, "$1 color is visibly different; test before production.")
    .replaceAll("Needs TD Input", "Add light pass-through value")
    .replaceAll("needs TD Input", "needs light pass-through value")
    .replaceAll("TD variance", "Light pass-through difference")
    .replaceAll("TD blockers", "light pass-through blockers")
    .replaceAll("TD ranking", "light pass-through ranking")
    .replaceAll("TD, material", "light pass-through, material")
    .replaceAll("Delta E", "Color closeness")
    .replaceAll("delta E", "color closeness")
    .replaceAll("TD", "light pass-through");
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  return "HueForge matching storage is unavailable. Open the app through Tauri to use local SQLite.";
}
