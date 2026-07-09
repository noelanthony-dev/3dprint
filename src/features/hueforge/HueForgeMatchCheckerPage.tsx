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
import { filamentRepository, hueForgeRepository, productsRepository } from "@/data/repositories";
import {
  FILAMENT_MATERIALS,
  formatGramsLeft,
  normalizeHexColor,
  type FilamentMaterial,
  type FilamentRecord,
} from "@/domain/inventory";
import {
  analyzeHueForgeMatches,
  validateHueForgeRequirement,
  type HueForgeFeasibilityStatus,
  type HueForgeMatchStatus,
  type HueForgeRequirementInput,
} from "@/domain/hueforge";
import type { ProductCategory } from "@/domain/products";

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
  readonly layerRange: string;
  readonly materialType: FilamentMaterial;
  readonly requiredGrams: string;
  readonly role: string;
  readonly transmissionDistance: string;
}

const emptyRequirement: RequirementFormState = {
  brand: "",
  colorName: "",
  hexColor: "#ffffff",
  layerRange: "",
  materialType: "PLA",
  requiredGrams: "0",
  role: "",
  transmissionDistance: "0",
};

const initialDesignForm: DesignFormState = {
  authorName: "NeonPrints3D",
  category: "Bookmarks",
  designName: "Cyberpunk Cityscape",
  imageReference: "",
  notes: "Requires author filament matching review. RGB color distance is a temporary heuristic; test-print before production if TD or color warnings appear.",
  saleUnit: "piece",
  sourceLink: "https://example.com/hueforge/cyberpunk-cityscape",
};

const initialRequirements: RequirementFormState[] = [
  {
    brand: "Bambu PLA Basic",
    colorName: "Black",
    hexColor: "#1a1a1a",
    layerRange: "L0-L12",
    materialType: "PLA",
    requiredGrams: "15.2",
    role: "Base / Shadow",
    transmissionDistance: "0.6",
  },
  {
    brand: "Polymaker PolyLite",
    colorName: "Purple",
    hexColor: "#8a2be2",
    layerRange: "L13-L18",
    materialType: "PLA",
    requiredGrams: "8.5",
    role: "Midtone 1",
    transmissionDistance: "2.4",
  },
  {
    brand: "eSun PLA+",
    colorName: "Magenta",
    hexColor: "#ff1493",
    layerRange: "L19-L24",
    materialType: "PLA+",
    requiredGrams: "4.2",
    role: "Midtone 2",
    transmissionDistance: "4.1",
  },
  {
    brand: "Sunlu PLA",
    colorName: "Cyan",
    hexColor: "#00ffff",
    layerRange: "L25-L30",
    materialType: "PLA",
    requiredGrams: "2.1",
    role: "Highlight",
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

export function HueForgeMatchCheckerPage() {
  const [designForm, setDesignForm] = useState<DesignFormState>(initialDesignForm);
  const [error, setError] = useState<string | null>(null);
  const [filaments, setFilaments] = useState<FilamentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [requirements, setRequirements] = useState<RequirementFormState[]>(initialRequirements);
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
        setValidationMessage(Object.values(validation.errors)[0] ?? "Check the requirement fields.");
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
          alternativeProfileIds: [],
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
      description="Compare author HueForge requirements against owned filament by material, RGB color distance, TD closeness, and stock availability."
      meta={["RGB distance heuristic", "No inventory deduction", "No Culori dependency"]}
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
            columns={["Role", "Brand / Color", "Mat", "TD", "g", "Layers", ""]}
            columnsTemplate="minmax(92px, 0.8fr) minmax(160px, 1.4fr) 0.45fr 0.42fr 0.42fr 0.62fr 34px"
            density="dense"
            footer={`${requirements.length} author requirements. RGB distance is temporary until Delta E matching is approved.`}
            rows={requirements.map((requirement, index) => [
              <input
                aria-label={`Role ${index + 1}`}
                className="table-input"
                onChange={(event) => setRequirementValue(index, "role", event.target.value, setRequirements)}
                value={requirement.role}
              />,
              <span className="table-field-stack">
                <input
                  aria-label={`Brand ${index + 1}`}
                  className="table-input"
                  onChange={(event) =>
                    setRequirementValue(index, "brand", event.target.value, setRequirements)
                  }
                  value={requirement.brand}
                />
                <span>
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
                aria-label={`TD ${index + 1}`}
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
              <input
                aria-label={`Layer range ${index + 1}`}
                className="table-input"
                onChange={(event) =>
                  setRequirementValue(index, "layerRange", event.target.value, setRequirements)
                }
                value={requirement.layerRange}
              />,
              <button className="table-link" onClick={() => removeRequirement(index)} type="button">
                x
              </button>,
            ])}
          />
        </Panel>

        <Panel title="Inventory Matches" actions={<Badge tone={feasibilityTone[analysis.feasibilityStatus]}>{analysis.feasibilityStatus}</Badge>}>
          <div className="match-list">
            {analysis.matches.map((match, index) => (
              <div className="match-card" key={`${match.requirement.role}-${index}`}>
                <span className="match-card__arrow">-&gt;</span>
                {match.matchedFilament ? (
                  <Swatch
                    color={match.matchedFilament.hexColor}
                    label={`${match.matchedFilament.brand} ${match.matchedFilament.name}`}
                  />
                ) : (
                  <Swatch color={match.requirement.hexColor} label="Missing owned filament" />
                )}
                <Badge tone={matchTone[match.status]}>{match.status}</Badge>
                <span className="match-card__copy">
                  {formatMatchCopy(match)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Feasibility Note">
        <div className={analysis.feasibilityStatus === "ready" ? "callout" : "callout callout--warning"}>
          <Badge tone={feasibilityTone[analysis.feasibilityStatus]}>
            {analysis.feasibilityStatus}
          </Badge>
          <p>{analysis.feasibilityNotes}</p>
        </div>
        {analysis.missingWarnings.length > 0 ? (
          <div className="status-grid hueforge-warning-grid">
            {analysis.missingWarnings.map((warning) => (
              <span key={warning}>
                {warning}
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

function toRequirementInput(form: RequirementFormState): HueForgeRequirementInput {
  return {
    brand: form.brand,
    colorName: form.colorName,
    hexColor: normalizeHexColor(form.hexColor),
    layerRange: form.layerRange,
    materialType: form.materialType,
    requiredGrams: Number(form.requiredGrams),
    role: form.role,
    transmissionDistance: Number(form.transmissionDistance),
  };
}

function formatMatchCopy(match: ReturnType<typeof analyzeHueForgeMatches>["matches"][number]): string {
  if (!match.matchedFilament) {
    return match.warning;
  }

  const tdCopy = match.tdDelta == null ? "TD unknown" : `TD Δ ${match.tdDelta.toFixed(1)}`;
  const colorCopy = match.colorDistance == null ? "color unknown" : `RGB dist ${match.colorDistance}`;

  return `${tdCopy} / ${colorCopy} / ${formatGramsLeft(match.matchedFilament.estimatedGramsLeft)} in stock`;
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
