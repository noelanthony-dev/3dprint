export type ScaffoldLayer = "domain" | "data" | "infrastructure";

export interface ScaffoldModuleStatus {
  readonly implementation: "placeholder";
  readonly layer: ScaffoldLayer;
  readonly name: string;
  readonly notes: readonly string[];
}

interface CreateScaffoldModuleStatusParams {
  readonly layer: ScaffoldLayer;
  readonly name: string;
  readonly notes?: readonly string[];
}

export function createScaffoldModuleStatus({
  layer,
  name,
  notes = [],
}: CreateScaffoldModuleStatusParams): ScaffoldModuleStatus {
  return {
    implementation: "placeholder",
    layer,
    name,
    notes,
  };
}

export function isPlaceholderModule(status: ScaffoldModuleStatus): boolean {
  return status.implementation === "placeholder";
}

