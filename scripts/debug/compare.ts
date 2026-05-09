import type { ScmAdapter } from "../../src/adapter";
import type { DebugConfig } from "./env";
import { writeDebugJson } from "./io";

export async function runCompareDebug(
  adapter: ScmAdapter,
  config: DebugConfig,
  outDir: string,
): Promise<void> {
  const compare = await adapter
    .getCompare(config.project, config.compareBase, config.compareHead)
    .catch((err) => {
      console.error("Error fetching compare:", err instanceof Error ? err.message : err);
      return null;
    });
  console.log(compare);
  if (compare) {
    await writeDebugJson(outDir, "compare.json", compare);
  }
}
