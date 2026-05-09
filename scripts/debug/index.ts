import "dotenv/config";
import { createScmAdapter } from "../../src/index";
// import { runCompareDebug } from "./compare";
import { loadDebugConfig } from "./env";
// import { ensureDebugOutputDir } from "./io";
// import { runRepoInfoDebug } from "./repo-info";
import { runSourceFilesDebug } from "./source-files";

async function main() {
  const config = loadDebugConfig();
  const adapter = createScmAdapter({
    type: "gitlab",
    base: config.base,
    token: config.token,
  });

  // const outDir = await ensureDebugOutputDir();
  // await runRepoInfoDebug(adapter, config, outDir);
  // await runCompareDebug(adapter, config, outDir);
  await runSourceFilesDebug(adapter, config);
}

main();
