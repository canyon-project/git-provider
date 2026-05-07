import "dotenv/config";
import { createScmAdapter } from "../index";
import { runCompareDebug } from "./compare";
import { loadDebugConfig } from "./env";
import { ensureDebugOutputDir } from "./io";
import { runRepoInfoDebug } from "./repo-info";
import { runSourceFilesDebug } from "./source-files";

async function main() {
  const config = loadDebugConfig();
  const outDir = await ensureDebugOutputDir();

  const adapter = createScmAdapter({
    type: "gitlab",
    base: config.base,
    token: config.token,
  });

  await runRepoInfoDebug(adapter, config, outDir);
  await runCompareDebug(adapter, config, outDir);
  await runSourceFilesDebug(adapter, config);
}

main();
