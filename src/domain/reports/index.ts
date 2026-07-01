import { createScaffoldModuleStatus } from "@/domain/shared";

export const reportsDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "reports",
  notes: ["Future monthly report calculations."],
});

