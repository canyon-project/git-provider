import type { ScmAdapter } from "./adapter.ts";
import {
  comparedRefsFromGitlabDiff,
  computeLineBucketsByRef,
  LINE_DIFF_MAX_FILTERED_FILES,
  pathMatchesLineDiffExtensions,
  type LineBuckets,
} from "./diff-line";
import { get } from "./request";
import type { Compare, CompareDiffItem, GitlabScmConfig, RepoInfo } from "./types.ts";

/** 唯一路径数超过该值时用 archive.zip；否则并发请求单文件 raw，避免为少量路径拉整仓 */
const SOURCE_FILES_ARCHIVE_THRESHOLD = 8;

export class GitlabAdapter implements ScmAdapter {
  private readonly base: string;
  private readonly token: string;

  constructor(config: GitlabScmConfig) {
    this.base = config.base.replace(/\/$/, "");
    this.token = config.token;
  }

  private headers(): Record<string, string> {
    return { "PRIVATE-TOKEN": this.token };
  }

  private fileRawUrl(repoID: string, filePath: string, ref: string): string {
    const encodedPath = encodeURIComponent(filePath);
    return `${this.base}/projects/${encodeURIComponent(repoID)}/repository/files/${encodedPath}/raw?ref=${encodeURIComponent(ref)}`;
  }

  private async getRawFileText(repoID: string, filePath: string, ref: string): Promise<string> {
    const { data } = await get<string>(this.fileRawUrl(repoID, filePath, ref), {
      headers: this.headers(),
    });
    return typeof data === "string" ? data : "";
  }

  async getRepoInfo(repoID: string): Promise<RepoInfo> {
    const url = `${this.base}/projects/${encodeURIComponent(repoID)}`;
    const { data } = await get<{
      id: number;
      path_with_namespace: string;
      description?: string;
    }>(url, { headers: this.headers() });
    return {
      id: String(data.id),
      pathWithNamespace: data.path_with_namespace,
      description: data.description ?? "",
    };
  }

  async getCompare(repoID: string, base: string, head: string): Promise<Compare> {
    // 1. 请求 GitLab「两个 ref 之间的比较」：提交列表 + 每文件的路径元数据（不依赖 raw 正文）
    const url = `${this.base}/projects/${encodeURIComponent(repoID)}/repository/compare?from=${encodeURIComponent(base)}&to=${encodeURIComponent(head)}`;
    const { data } = await get<{
      commits?: Array<{ id: string }>;
      diffs?: Array<{
        new_path?: string;
        old_path?: string;
        new_file?: boolean;
        deleted_file?: boolean;
      }>;
    }>(url, { headers: this.headers() });

    // 2. 每条 diff（可能含新增/删除/重命名）；后续只处理有可解析路径的条目
    const diffRows = data.diffs ?? [];

    // 3. API 条目 → 「展示路径 + base/head 各自要拉的路径」（重命名时左右路径可不同）；再按后端白名单后缀筛掉不参与逐行 diff 的文件（如 .prisma）
    const comparedPaths = diffRows
      .map(comparedRefsFromGitlabDiff)
      .filter((entry): entry is NonNullable<typeof entry> => entry != null)
      .filter((entry) => pathMatchesLineDiffExtensions(entry.keyPath));

    // 4. 无白名单文件、或文件数超过上限：不拉正文；否则用 getSourceFiles 批量取 base/head（路径多时走 archive.zip，少时并发 raw），再按 diff 库算行号
    let lineBuckets: Map<string, LineBuckets>;
    if (
      comparedPaths.length === 0 ||
      comparedPaths.length > LINE_DIFF_MAX_FILTERED_FILES
    ) {
      lineBuckets = new Map<string, LineBuckets>();
    } else {
      const basePaths = [...new Set(comparedPaths.map((p) => p.pathAtBase))];
      const headPaths = [...new Set(comparedPaths.map((p) => p.pathAtHead))];
      const [baseTexts, headTexts] = await Promise.all([
        this.getSourceFiles(repoID, base, basePaths),
        this.getSourceFiles(repoID, head, headPaths),
      ]);
      lineBuckets = await computeLineBucketsByRef(comparedPaths, base, head, (path, ref) =>
        Promise.resolve(
          ref === base ? (baseTexts.get(path) ?? "") : ref === head ? (headTexts.get(path) ?? "") : "",
        ),
      );
    }

    // 5. 仍遍历全部 diff 行以拿到 path，但只保留白名单扩展名；与第 4 步 Map 对齐得到 additions/deletions（未参与拉取的文件不会进列表）
    const changedFiles: CompareDiffItem[] = diffRows
      .map((d) => {
        const refs = comparedRefsFromGitlabDiff(d);
        const path = refs?.keyPath ?? (d.new_path || d.old_path || "");
        const buckets = lineBuckets.get(path);
        return {
          path,
          additions: buckets?.additions ?? [],
          deletions: buckets?.deletions ?? [],
        };
      })
      .filter((item) => pathMatchesLineDiffExtensions(item.path));

    // 6. 提交 id 列表直接来自 compare 响应；变更文件列表仅白名单后缀，行号可能为空（大批量 compare 或未参与逐行的超大文件）
    return {
      commitList: (data.commits ?? []).map((c) => c.id),
      changedFiles,
    };
  }

  async getSourceFiles(
    repoID: string,
    sha: string,
    filePaths: string[],
  ): Promise<Map<string, string>> {
    const uniquePaths = [...new Set(filePaths)];
    const wantAllFiles = uniquePaths.length === 0;

    if (!wantAllFiles && uniquePaths.length <= SOURCE_FILES_ARCHIVE_THRESHOLD) {
      const settled = await Promise.allSettled(
        uniquePaths.map((path) =>
          this.getRawFileText(repoID, path, sha).then((text) => ({ path, text })),
        ),
      );
      const result = new Map<string, string>();
      for (const s of settled) {
        if (s.status === "fulfilled") {
          result.set(s.value.path, s.value.text);
        }
      }
      return result;
    }

    const pid = encodeURIComponent(repoID);
    const archiveUrl = `${this.base}/projects/${pid}/repository/archive.zip`;
    const { data } = await get(archiveUrl, {
      headers: this.headers(),
      params: { sha },
      responseType: "arraybuffer",
      timeout: 60_000,
    });
    const { default: AdmZip } = await import("adm-zip");
    const { tmpNameSync } = await import("tmp");
    const fs = await import("node:fs");
    const tempZip = tmpNameSync({ postfix: ".zip" });
    try {
      const bin = data as ArrayBuffer | Uint8Array;
      const buf = Buffer.isBuffer(bin)
        ? bin
        : bin instanceof ArrayBuffer
          ? Buffer.from(bin)
          : Buffer.from(bin);
      fs.writeFileSync(tempZip, buf);
      const zip = new AdmZip(tempZip);
      const entries = zip.getEntries();
      const targetSet = wantAllFiles ? null : new Set(uniquePaths);
      const result = new Map<string, string>();
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const name = entry.entryName;
        const parts = name.split("/");
        if (parts.length < 2) continue;
        const relativePath = parts.slice(1).join("/");
        if (targetSet && !targetSet.has(relativePath)) continue;
        try {
          const content = entry.getData().toString("utf8");
          result.set(relativePath, content);
        } catch {
          // skip binary or invalid utf8
        }
      }
      return result;
    } finally {
      try {
        fs.unlinkSync(tempZip);
      } catch {
        // ignore
      }
    }
  }
}
