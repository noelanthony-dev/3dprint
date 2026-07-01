export * from "./addOnsRepository";
export * from "./expensesRepository";
export * from "./filamentsRepository";
export * from "./finishedGoodsRepository";
export * from "./hueForgeRepository";
export * from "./printProfilesRepository";
export * from "./productionRunsRepository";
export * from "./productsRepository";
export * from "./salesRepository";

export const repositoryBoundary = {
  description: "All future SQLite access must go through repositories.",
  rawSqlAllowedInReact: false,
} as const;
