import type { ScmAdapter } from "./adapter";
import { GithubAdapter } from "./github";
import { GitlabAdapter } from "./gitlab";
import type { ScmConfig } from "./types";

export type { ScmAdapter } from "./adapter";
export type {
  CommitSummary,
  Compare,
  CompareDiffItem,
  RepoInfo,
  ScmConfig,
  ScmType,
} from "./types";

/**
 * 根据配置里的 `type`（github / gitlab …）创建对应适配器，调用方只依赖返回的 `ScmAdapter`。
 */
export function createScmAdapter(config: ScmConfig): ScmAdapter {
  switch (config.type) {
    case "github":
      return new GithubAdapter(config);
    case "gitlab":
      return new GitlabAdapter(config);
  }
}
