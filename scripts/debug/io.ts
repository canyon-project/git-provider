import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function debugOutputDir(): string {
  return join(process.cwd(), "debug-output");
}

export async function ensureDebugOutputDir(): Promise<string> {
  const out = debugOutputDir();
  await mkdir(out, { recursive: true });
  return out;
}

export async function writeDebugJson(
  outDir: string,
  filename: string,
  data: unknown,
): Promise<void> {
  const path = join(outDir, filename);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`已写入 ${path}`);
}
