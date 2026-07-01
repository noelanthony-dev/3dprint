import { createScaffoldModuleStatus } from "@/domain/shared";

export const inventoryDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "inventory",
  notes: ["Future stock adjustment and availability rules."],
});

