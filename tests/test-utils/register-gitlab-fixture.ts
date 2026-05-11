import AdmZip from "adm-zip";
import type { GitlabMockScenario } from "./mock-gitlab-http-server";
import {
  archiveMapKey,
  commitMapKey,
  compareMapKey,
  rawMapKey,
} from "./mock-gitlab-http-server";

export type ProjectApiBody = {
  id: number;
  path_with_namespace: string;
  description?: string;
};

/** 将「单项目详情」接口 200 响应 JSON 注册到 scenario */
export function registerProjectResponse(
  scenario: GitlabMockScenario,
  repoId: string,
  body: ProjectApiBody,
): void {
  scenario.projects.set(repoId, body);
}

export type RawScenarioFixture = {
  repoId: string;
  ref: string;
  path: string;
  body?: string;
  /** 非 200 时写 `500` 等，与 mock 服务约定一致 */
  httpStatus?: number;
};

export function registerRawScenario(scenario: GitlabMockScenario, f: RawScenarioFixture): void {
  const key = rawMapKey(f.repoId, f.ref, f.path);
  if (f.httpStatus === 500) {
    scenario.raw500.add(key);
    return;
  }
  if (f.body !== undefined) {
    scenario.rawBody.set(key, f.body);
    return;
  }
  throw new Error("raw fixture 需要 body 或 httpStatus: 500");
}

export type ArchiveScenarioFixture = {
  repoId: string;
  sha: string;
  /** 与 GitLab archive 顶层目录名类似，缺省为 repo-export-123 */
  rootFolder?: string;
  files: Record<string, string>;
};

export function registerArchiveScenario(
  scenario: GitlabMockScenario,
  f: ArchiveScenarioFixture,
): void {
  const root = f.rootFolder ?? "repo-export-123";
  const zip = new AdmZip();
  for (const [rel, text] of Object.entries(f.files)) {
    zip.addFile(`${root}/${rel}`, Buffer.from(text, "utf8"));
  }
  scenario.archives.set(archiveMapKey(f.repoId, f.sha), zip.toBuffer());
}

/** 注册 `GET /projects/:id/repository/compare?from=&to=` 的 200 JSON（与 GitLab 响应体一致） */
export function registerCompareResponse(
  scenario: GitlabMockScenario,
  repoId: string,
  from: string,
  to: string,
  body: unknown,
): void {
  scenario.compareResponses.set(compareMapKey(repoId, from, to), body);
}

/** 注册 `GET /projects/:id/repository/commits/:sha` 的 200 JSON（与 GitLab 单提交接口一致，为单对象） */
export function registerCommitResponse(
  scenario: GitlabMockScenario,
  repoId: string,
  sha: string,
  body: unknown,
): void {
  scenario.commits.set(commitMapKey(repoId, sha), body);
}
