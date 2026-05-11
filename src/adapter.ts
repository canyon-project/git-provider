import type { CommitSummary, RepoInfo, Compare } from "./types.ts";

/**
 * SCM 适配器接口：业务层只依赖此接口，通过 createScmAdapter 获取具体实现。
 */
export interface ScmAdapter {
  /** 获取仓库信息（id、pathWithNamespace、description） */
  getRepoInfo(repoID: string): Promise<RepoInfo>;

  /** 获取 base..head 之间 commit sha 列表（顺序与 GitLab `repository/compare` 返回的 `commits` 一致；无 `commits` 时可能仅有 `commit.id`） */
  getCommitsBetween(repoID: string, base: string, head: string): Promise<string[]>;

  /**
   * 获取指定 ref（分支名、tag 等）当前 tip 的最新一条提交
   * @param ref 分支名或与 GitLab `ref_name` / GitHub `sha` 查询参数兼容的引用
   */
  getCommit(repoID: string, ref: string): Promise<CommitSummary>;

  /** 获取 base...head 之间变更 */
  getCompare(repoID: string, base: string, head: string): Promise<Compare>;

  /**
   * 批量获取指定 ref 下多个文件的源码（通过 archive 下载后解压提取，避免逐文件请求）
   * @returns Map<相对路径, 文件内容 UTF-8 字符串>
   */
  getSourceFiles(repoID: string, sha: string, filePaths: string[]): Promise<Map<string, string>>;
}
