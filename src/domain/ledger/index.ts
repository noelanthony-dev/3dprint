import { createScaffoldModuleStatus } from "@/domain/shared";

export const ledgerDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "ledger",
  notes: ["Future stock and money movement summaries."],
});

