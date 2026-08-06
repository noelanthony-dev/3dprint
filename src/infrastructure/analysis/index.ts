import { analysisExportRepository, type AnalysisExportSnapshot } from "@/data/repositories";
import { buildAiAnalysisPack, type AiAnalysisPackV1 } from "@/domain/analysis";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";

const APP_VERSION = "0.1.0";
const ANALYSIS_FILE_PREFIX = "printops-ai-analysis";

export interface AnalysisExportResult {
  readonly canceled: boolean;
  readonly filePath: string | null;
  readonly message: string;
  readonly recordCount: number;
}

export interface AnalysisExportDependencies {
  readonly loadSnapshot: () => Promise<AnalysisExportSnapshot>;
  readonly now: () => Date;
  readonly saveFile: (options: {
    readonly defaultPath: string;
    readonly filters: { extensions: string[]; name: string }[];
    readonly title: string;
  }) => Promise<string | null>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
}

const defaultDependencies: AnalysisExportDependencies = {
  loadSnapshot: () => analysisExportRepository.loadSnapshot(),
  now: () => new Date(),
  saveFile: (options) => save(options),
  writeFile: writeTextFile,
};

export async function exportAiAnalysisPack(
  dependencies: AnalysisExportDependencies = defaultDependencies,
): Promise<AnalysisExportResult> {
  const generatedAt = dependencies.now().toISOString();
  const filePath = await dependencies.saveFile({
    defaultPath: `${ANALYSIS_FILE_PREFIX}-${timestampForFileName(generatedAt)}.json`,
    filters: [{ extensions: ["json"], name: "PrintOps AI analysis" }],
    title: "Export AI Analysis Pack",
  });

  if (!filePath) {
    return {
      canceled: true,
      filePath: null,
      message: "AI Analysis Pack export canceled.",
      recordCount: 0,
    };
  }

  const snapshot = await dependencies.loadSnapshot();
  const pack = buildAiAnalysisPack({
    appVersion: APP_VERSION,
    generatedAt,
    settings: snapshot.settings,
    sourceData: snapshot.sourceData,
  });
  const recordCount = totalRecordCount(pack);

  await dependencies.writeFile(filePath, `${JSON.stringify(pack, null, 2)}\n`);

  return {
    canceled: false,
    filePath,
    message: `AI Analysis Pack exported with ${recordCount} source records.`,
    recordCount,
  };
}

export function timestampForFileName(isoDate: string): string {
  return isoDate.replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function totalRecordCount(pack: AiAnalysisPackV1): number {
  return Object.values(pack.metadata.recordCounts).reduce((total, count) => total + count, 0);
}
