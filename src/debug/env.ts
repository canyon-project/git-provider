export type DebugConfig = {
  base: string;
  token: string;
  project: string;
  compareBase: string;
  compareHead: string;
  sourceSha: string;
  filePaths: string[];
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === "") {
    throw new Error(`缺少环境变量 ${name}，请参照 .env.example 配置 .env`);
  }
  return v;
}

function parseSourceFilePaths(raw: string | undefined): string[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function loadDebugConfig(): DebugConfig {
  const compareHead = requireEnv("DEBUG_COMPARE_HEAD_SHA");
  return {
    base: requireEnv("DEBUG_GITLAB_BASE"),
    token: requireEnv("DEBUG_GITLAB_TOKEN"),
    project: requireEnv("DEBUG_GITLAB_PROJECT"),
    compareBase: requireEnv("DEBUG_COMPARE_BASE_SHA"),
    compareHead,
    sourceSha: process.env.DEBUG_SOURCE_SHA?.trim() || compareHead,
    filePaths: parseSourceFilePaths(process.env.DEBUG_SOURCE_FILE_PATHS),
  };
}
