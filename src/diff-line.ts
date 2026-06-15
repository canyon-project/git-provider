import { diffLines } from "diff";

/** 参与逐行 diff 的源码扩展名（不含点）；匹配时按后缀长度降序避免 `.tsx` 被当成 `.ts`。 */
export const DEFAULT_LINE_DIFF_EXTENSIONS = ["tsx", "ts", "jsx", "js"] as const;

/** 白名单后缀筛完后最多处理这么多文件（超出则整块不做 raw + 逐行比对） */
export const LINE_DIFF_MAX_FILTERED_FILES = 1500;

/** 任一侧全文超过此行数则跳过该文件的逐行 diff（仍列在 changedFiles 中，行号为空） */
export const LINE_DIFF_MAX_LINES_PER_FILE_SIDE = 10_000;

export function textExceedsLineCount(text: string, maxLines: number): boolean {
  if (maxLines < 1) return true;
  if (text === "") return false;
  let n = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      n++;
      if (n > maxLines) return true;
    }
  }
  return false;
}

function textsExceedDiffLineBudget(oldText: string, newText: string, maxLines: number): boolean {
  return textExceedsLineCount(oldText, maxLines) || textExceedsLineCount(newText, maxLines);
}

export type LineBuckets = {
  additions: number[];
  deletions: number[];
};

/** 任一路径段名含典型测试目录片段则不做逐行 diff（如 `src/__tests__/x.ts`、`__test__/foo.ts`）。 */
function pathTouchesTestSegmentMarker(filePath: string): boolean {
  for (const segment of filePath.split("/")) {
    const lower = segment.toLowerCase();
    if (lower.includes("__tests__") || lower.includes("__test__")) return true;
  }
  return false;
}

/** 后缀在白名单且路径为非测试fixture（不含 `__test__`/`__tests__` 片段）时为 true */
export function pathMatchesLineDiffExtensions(
  filePath: string,
  extensions: readonly string[] = DEFAULT_LINE_DIFF_EXTENSIONS,
): boolean {
  if (pathTouchesTestSegmentMarker(filePath)) return false;
  const basename = filePath.split("/").pop() ?? "";
  if (!basename.includes(".")) return false;
  const sorted = [...extensions].sort((a, b) => b.length - a.length);
  const lower = basename.toLowerCase();
  return sorted.some((ext) => lower.endsWith(`.${ext.toLowerCase()}`));
}

/**
 * 给定同一文件在「旧版 / 新版」两段全文下的行号桶（算法与原先的 diffLines 口径一致）。
 */
export function lineBucketsFromTexts(oldText: string, newText: string): LineBuckets {
  const changes = diffLines(oldText ?? "", newText ?? "");
  const additions: number[] = [];
  const deletions: number[] = [];

  let newLine = 0;
  let oldLine = 0;

  for (const change of changes) {
    const count = change.count ?? 0;
    if (change.added) {
      for (let i = 0; i < count; i++) {
        additions.push(newLine + i + 1);
      }
      newLine += count;
    } else if (change.removed) {
      for (let i = 0; i < count; i++) {
        deletions.push(oldLine + i + 1);
      }
      oldLine += count;
    } else {
      newLine += count;
      oldLine += count;
    }
  }

  return { additions, deletions };
}

/**
 * 「比较结果」里每一行 diff 在两套 ref 上各自对应的路径：重命名时 base 侧取旧路径，head 侧取新路径。
 */
export type ComparedRefsPath = {
  /** 与 CompareDiffItem.path 对齐：`new_path` 优先 */
  keyPath: string;
  pathAtBase: string;
  pathAtHead: string;
};

export function comparedRefsFromGitlabDiff(diff: {
  old_path?: string;
  new_path?: string;
}): ComparedRefsPath | null {
  const oldPath = diff.old_path ?? "";
  const newPath = diff.new_path ?? "";

  const keyPath = newPath || oldPath || "";
  if (!keyPath) return null;

  const pathAtBase = oldPath || newPath;
  const pathAtHead = newPath || oldPath;

  return { keyPath, pathAtBase, pathAtHead };
}

/**
 * 调用方可自行按扩展名等规则筛掉不需要的路径；本函数对已传入的列表全部拉全文并分段并发。
 * 任一版本全文行数超过 `LINE_DIFF_MAX_LINES_PER_FILE_SIDE` 时该行号结果退化为空数组（仍会请求 raw）。
 */
export async function computeLineBucketsByRef(
  files: readonly ComparedRefsPath[],
  baseRef: string,
  headRef: string,
  fetchText: (filePath: string, ref: string) => Promise<string>,
  concurrent?: number,
): Promise<Map<string, LineBuckets>> {
  const chunk = concurrent != null ? Math.max(1, concurrent) : Math.min(files.length || 1, 64);
  const out = new Map<string, LineBuckets>();

  for (let offset = 0; offset < files.length; offset += chunk) {
    const slice = files.slice(offset, offset + chunk);
    const parts = await Promise.all(
      slice.map(async ({ keyPath, pathAtBase, pathAtHead }) => {
        const [oldText, newText] = await Promise.all([
          fetchText(pathAtBase, baseRef).catch(() => ""),
          fetchText(pathAtHead, headRef).catch(() => ""),
        ]);
        const buckets = textsExceedDiffLineBudget(
          oldText,
          newText,
          LINE_DIFF_MAX_LINES_PER_FILE_SIDE,
        )
          ? { additions: [], deletions: [] }
          : lineBucketsFromTexts(oldText, newText);
        return { keyPath, buckets };
      }),
    );
    for (const { keyPath, buckets } of parts) {
      out.set(keyPath, buckets);
    }
  }

  return out;
}
