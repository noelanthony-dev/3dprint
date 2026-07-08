import { createScaffoldModuleStatus } from "@/domain/shared";

export * from "./addons";
export * from "./filaments";
export * from "./filamentProfiles";
export * from "./finishedGoods";

export const inventoryDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "inventory",
  notes: ["Future stock adjustment and availability rules."],
});
