import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

export interface SalesCsvExportDependencies {
  readonly saveFile: (options: {
    readonly defaultPath: string;
    readonly filters: { extensions: string[]; name: string }[];
    readonly title: string;
  }) => Promise<string | null>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
}

const defaultDependencies: SalesCsvExportDependencies = {
  saveFile: (options) => save(options),
  writeFile: writeTextFile,
};

export async function exportSalesCsv(
  filename: string,
  contents: string,
  dependencies: SalesCsvExportDependencies = defaultDependencies,
): Promise<{ readonly canceled: boolean }> {
  const path = await dependencies.saveFile({
    defaultPath: filename,
    filters: [{ extensions: ["csv"], name: "Sales CSV" }],
    title: "Export filtered sales",
  });

  if (!path) {
    return { canceled: true };
  }

  await dependencies.writeFile(path, contents);
  return { canceled: false };
}
