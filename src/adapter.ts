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
   * 获取单个提交（GitLab：`GET .../repository/commits/:sha`，路径参数可为完整/短 SHA、分支名或 tag）
   */
  getCommit(repoID: string, sha: string): Promise<CommitSummary>;

  /** 获取 base...head 之间变更 */
  getCompare(repoID: string, base: string, head: string): Promise<Compare>;

  /**
   * 批量获取指定 ref 下多个文件的源码（通过 archive 下载后解压提取，避免逐文件请求）
   * @returns Map<相对路径, 文件内容 UTF-8 字符串>
   */
  getSourceFiles(repoID: string, sha: string, filePaths: string[]): Promise<Map<string, string>>;
}
