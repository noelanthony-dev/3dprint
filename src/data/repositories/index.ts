export * from "./filamentsRepository";

export const repositoryBoundary = {
  description: "All future SQLite access must go through repositories.",
  rawSqlAllowedInReact: false,
} as const;
