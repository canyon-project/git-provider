import type { ScmAdapter } from "./adapter.ts";
import { get } from "./request";
import type { Compare, GithubScmConfig, RepoInfo } from "./types.ts";

const GITHUB_BASE = "https://api.github.com";

export class GithubAdapter implements ScmAdapter {
  private readonly base = GITHUB_BASE;
  private readonly token: string;

  constructor(config: GithubScmConfig) {
    this.token = config.token;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.v3+json",
    };
  }

  /**
   * 支持 repoID：数字 ID，或 owner/repo 形式
   */
  async getRepoInfo(repoID: string): Promise<RepoInfo> {
    const raw = repoID.trim();
    let url: string;
    if (raw.includes("/")) {
      const [owner, repo] = raw.split("/");
      if (!owner || !repo) throw new Error("GitHub owner/repo 格式无效");
      url = `${this.base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    } else {
      url = `${this.base}/repositories/${encodeURIComponent(raw)}`;
    }
    const { data } = await get<{
      id?: number;
      full_name?: string;
      description?: string;
    }>(url, { headers: this.headers() });
    if (!data?.full_name) {
      throw new Error("GitHub 未返回 full_name");
    }
    return {
      id: String(data.id),
      pathWithNamespace: data.full_name,
      description: data.description ?? "",
    };
  }

  async getCompare(_repoID: string, _base: string, _head: string): Promise<Compare> {
    throw new Error("GitHubAdapter.getCompare 尚未实现");
  }

  async getSourceFiles(repoID:string, sha:string, filePaths:string[]):Promise<Map<string, string>>{
    throw new Error("GitHubAdapter.getSourceFiles 尚未实现");
  }
}
