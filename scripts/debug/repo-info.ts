import type { ScmAdapter } from "../../src/adapter";
import type { DebugConfig } from "./env";
import { writeDebugJson } from "./io";

export async function runRepoInfoDebug(
  adapter: ScmAdapter,
  config: DebugConfig,
  outDir: string,
): Promise<void> {
  const repoInfo = await adapter.getRepoInfo(config.project).catch((err) => {
    console.error("Error fetching repo info:", err instanceof Error ? err.message : err);
    return null;
  });
  console.log(repoInfo);
  if (repoInfo) {
    await writeDebugJson(outDir, "repo-info.json", repoInfo);
  }
}
