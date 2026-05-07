import type { ScmAdapter } from "../adapter";
import type { DebugConfig } from "./env";

export async function runSourceFilesDebug(adapter: ScmAdapter, config: DebugConfig): Promise<void> {
  const map = await adapter
    .getSourceFiles(config.project, config.sourceSha, config.filePaths)
    .catch((err) => {
      console.error("Error fetching source files:", err instanceof Error ? err.message : err);
      return null;
    });
  console.log(map?.size);
}
