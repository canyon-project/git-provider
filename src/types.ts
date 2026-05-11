export type ScmType = "github" | "gitlab";

export type GitlabScmConfig = { type: "gitlab"; base: string; token: string };
export type GithubScmConfig = { type: "github"; token: string };

/** GitLab 需 base + token，GitHub 仅需 token（base 固定为 api.github.com） */
export type ScmConfig = GitlabScmConfig | GithubScmConfig;

export interface RepoInfo {
  /** 平台返回的仓库 ID（如 GitLab project id、GitHub repo id），String(data.id) */
  id: string;
  pathWithNamespace: string;
  description: string;
}

export interface CompareDiffItem {
  path: string;
  additions: number[];
  deletions: number[];
}

export interface Compare {
  commitList: string[];
  changedFiles: CompareDiffItem[];
}

/** 单个提交的摘要（如 `repository/commits/:sha`） */
export interface CommitSummary {
  sha: string;
  title: string;
  authorName: string;
  authorEmail: string;
  /** ISO 8601，取平台提交时间字段（优先提交时间） */
  createdAt: string;
}
