import { lineBucketsFromTexts } from "../src/diff-line";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GitlabAdapter } from "../src/gitlab";
import errCompareNotFound from "./test-utils/fixtures/gitlab/api/errors/compare-not-found.json";
import errNotFoundProject from "./test-utils/fixtures/gitlab/api/errors/not-found-project.json";
import compareCommitsBetween from "./test-utils/fixtures/gitlab/api/compare/commits-between.json";
import commitMainTip from "./test-utils/fixtures/gitlab/api/commits/main-tip.json";
import compareEmpty from "./test-utils/fixtures/gitlab/api/compare/empty.json";
import compareMixed from "./test-utils/fixtures/gitlab/api/compare/mixed-ext.json";
import compareNineTs from "./test-utils/fixtures/gitlab/api/compare/nine-ts.json";
import compareRename from "./test-utils/fixtures/gitlab/api/compare/rename-ts.json";
import compareSingleTs from "./test-utils/fixtures/gitlab/api/compare/single-ts.json";
import project1 from "./test-utils/fixtures/gitlab/api/projects/1.json";
import projectGroupSub from "./test-utils/fixtures/gitlab/api/projects/group-sub-project.json";
import archiveCompareNineBase from "./test-utils/fixtures/gitlab/scenario/archives/compare-nine-base.json";
import archiveCompareNineHead from "./test-utils/fixtures/gitlab/scenario/archives/compare-nine-head.json";
import archive1Sha from "./test-utils/fixtures/gitlab/scenario/archives/1-sha.json";
import archiveNsProj from "./test-utils/fixtures/gitlab/scenario/archives/ns-proj-deadbeef.json";
import rawCompareMixedB from "./test-utils/fixtures/gitlab/scenario/raw/compare-p-mixed-b0-foo.json";
import rawCompareMixedH from "./test-utils/fixtures/gitlab/scenario/raw/compare-p-mixed-h0-foo.json";
import rawCompareRenB from "./test-utils/fixtures/gitlab/scenario/raw/compare-p-ren-rb-old.json";
import rawCompareRenH from "./test-utils/fixtures/gitlab/scenario/raw/compare-p-ren-rh-new.json";
import rawCompareSingleB from "./test-utils/fixtures/gitlab/scenario/raw/compare-p-single-baseR-foo.json";
import rawCompareSingleH from "./test-utils/fixtures/gitlab/scenario/raw/compare-p-single-headR-foo.json";
import raw1abcB500 from "./test-utils/fixtures/gitlab/scenario/raw/1-abc-b-ts-500.json";
import raw1abcSrcA from "./test-utils/fixtures/gitlab/scenario/raw/1-abc-src-a-ts.json";
import rawGpX from "./test-utils/fixtures/gitlab/scenario/raw/g-p-sha1-x-ts.json";
import {
  resetScenario,
  startGitlabMockServer,
  type GitlabMockServer,
} from "./test-utils/mock-gitlab-http-server";
import {
  registerArchiveScenario,
  registerCommitResponse,
  registerCompareResponse,
  registerProjectResponse,
  registerRawScenario,
} from "./test-utils/register-gitlab-fixture";

describe("GitlabAdapter（本机 HTTP mock，响应体来自 JSON fixture）", () => {
  let mock: GitlabMockServer;

  beforeAll(async () => {
    mock = await startGitlabMockServer();
  });

  afterAll(async () => {
    await mock.close();
  });

  beforeEach(() => {
    resetScenario(mock.scenario);
    mock.clearLog();
  });

  describe("getRepoInfo", () => {
    it("请求正确的路径与头，并把 API 响应映射为 RepoInfo", async () => {
      registerProjectResponse(mock.scenario, "group/sub/project", projectGroupSub);

      const adapter = new GitlabAdapter({
        type: "gitlab",
        base: mock.baseUrl,
        token: "test-token",
      });

      const info = await adapter.getRepoInfo("group/sub/project");

      expect(mock.requestLog).toEqual([
        expect.objectContaining({
          method: "GET",
          path: "/api/v4/projects/group%2Fsub%2Fproject",
          token: "test-token",
        }),
      ]);
      expect(info).toEqual({
        id: "12345",
        pathWithNamespace: "group/sub/project",
        description: "说明文字",
      });
    });

    it("base 末尾去斜杠，description 缺省时为空字符串", async () => {
      registerProjectResponse(mock.scenario, "1", project1);

      const adapter = new GitlabAdapter({
        type: "gitlab",
        base: `${mock.baseUrl}/`,
        token: "t",
      });

      const info = await adapter.getRepoInfo("1");

      expect(mock.requestLog[0]?.path).toBe("/api/v4/projects/1");
      expect(info.description).toBe("");
    });

    it("404 时抛出 HttpError，响应体与 fixture 一致", async () => {
      const adapter = new GitlabAdapter({
        type: "gitlab",
        base: mock.baseUrl,
        token: "t",
      });

      await expect(adapter.getRepoInfo("missing")).rejects.toMatchObject({
        name: "HttpError",
        status: 404,
        data: errNotFoundProject,
      });
    });
  });

  describe("getCommit", () => {
    it("请求 GET .../repository/commits/:sha 并映射为 CommitSummary", async () => {
      const sha = "94d4429f5019c5b9f4f555c59236462ad6836f2f";
      registerCommitResponse(mock.scenario, "143323", sha, commitMainTip);

      const adapter = new GitlabAdapter({
        type: "gitlab",
        base: mock.baseUrl,
        token: "test-token",
      });

      const c = await adapter.getCommit("143323", sha);

      expect(mock.requestLog).toEqual([
        expect.objectContaining({
          method: "GET",
          path: `/api/v4/projects/143323/repository/commits/${sha}`,
          token: "test-token",
        }),
      ]);
      expect(c).toEqual({
        sha: "94d4429f5019c5b9f4f555c59236462ad6836f2f",
        title: "feat: 单提交接口",
        authorName: "张三",
        authorEmail: "zhang@example.com",
        createdAt: "2026-05-10T08:30:00.000Z",
      });
    });
  });

  describe("getSourceFiles", () => {
    const token = "tok";

    it("路径较少时走逐文件 raw：失败条目从 Map 中省略", async () => {
      registerRawScenario(mock.scenario, raw1abcSrcA);
      registerRawScenario(mock.scenario, raw1abcB500);

      const adapter = new GitlabAdapter({
        type: "gitlab",
        base: mock.baseUrl,
        token,
      });

      const map = await adapter.getSourceFiles("1", "abc", ["src/a.ts", "b.ts"]);

      const rawReqs = mock.requestLog.filter((e) => e.path.includes("/repository/files/"));
      expect(rawReqs.length).toBe(2);
      expect(mock.requestLog.some((e) => e.path.includes("/archive.zip"))).toBe(false);
      expect(map.get("src/a.ts")).toBe(raw1abcSrcA.body);
      expect(map.has("b.ts")).toBe(false);
    });

    it("路径去重，仅对每个唯一路径请求一次", async () => {
      registerRawScenario(mock.scenario, rawGpX);

      const adapter = new GitlabAdapter({
        type: "gitlab",
        base: mock.baseUrl,
        token,
      });

      await adapter.getSourceFiles("g/p", "sha1", ["x.ts", "x.ts"]);

      expect(mock.requestLog.filter((e) => e.path.includes("/repository/files/"))).toHaveLength(1);
    });

    it("路径数 >8 时走 archive.zip，并解析出目标文件", async () => {
      registerArchiveScenario(mock.scenario, archiveNsProj);

      const adapter = new GitlabAdapter({
        type: "gitlab",
        base: mock.baseUrl,
        token,
      });

      const paths = Array.from({ length: 9 }, (_, i) => `f${i + 1}.ts`);
      const map = await adapter.getSourceFiles("ns/proj", "deadbeef", paths);

      const archiveHit = mock.requestLog.find((e) => e.path.endsWith("/repository/archive.zip"));
      expect(archiveHit).toMatchObject({
        method: "GET",
        token,
      });
      expect(archiveHit?.search).toContain("sha=deadbeef");
      expect(mock.requestLog.some((e) => e.path.includes("/repository/files/"))).toBe(false);

      expect(map.get("f1.ts")).toBe("c1");
      expect(map.get("f9.ts")).toBe("c9");
      expect(map.size).toBe(9);
    });

    it("filePaths 为空时拉整包 zip", async () => {
      registerArchiveScenario(mock.scenario, archive1Sha);

      const adapter = new GitlabAdapter({
        type: "gitlab",
        base: mock.baseUrl,
        token,
      });

      const map = await adapter.getSourceFiles("1", "sha", []);

      expect(map.get("README.md")).toBe(archive1Sha.files["README.md"]);
      expect(map.get("src/x.ts")).toBe(archive1Sha.files["src/x.ts"]);
      expect(map.size).toBe(2);
    });
  });

  describe("getCompare", () => {
    const tok = "tok2";

    it("compare + 单文件 raw：commits、逐行增删与 fixture 正文一致", async () => {
      registerCompareResponse(mock.scenario, "p/single", "baseR", "headR", compareSingleTs);
      registerRawScenario(mock.scenario, rawCompareSingleB);
      registerRawScenario(mock.scenario, rawCompareSingleH);

      const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: tok });
      const cmp = await adapter.getCompare("p/single", "baseR", "headR");

      expect(cmp.commitList).toEqual(["commit-a", "commit-b"]);
      const row = cmp.changedFiles.find((c) => c.path === "src/foo.ts");
      expect(row).toBeDefined();
      expect(row).toMatchObject(
        lineBucketsFromTexts(rawCompareSingleB.body ?? "", rawCompareSingleH.body ?? ""),
      );
      const compareHit = mock.requestLog.find((e) => e.path.endsWith("/repository/compare"));
      expect(compareHit?.search).toContain("from=baseR");
      expect(compareHit?.search).toContain("to=headR");
    });

    it("非白名单扩展名不会出现在 changedFiles（如 README.md；源码与模板后缀会保留）", async () => {
      registerCompareResponse(mock.scenario, "p/mixed", "b0", "h0", compareMixed);
      registerRawScenario(mock.scenario, rawCompareMixedB);
      registerRawScenario(mock.scenario, rawCompareMixedH);

      const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: tok });
      const cmp = await adapter.getCompare("p/mixed", "b0", "h0");

      expect(cmp.changedFiles).toHaveLength(1);
      expect(cmp.changedFiles[0]?.path).toBe("src/foo.ts");
      expect(cmp.changedFiles[0]).toMatchObject(
        lineBucketsFromTexts(rawCompareMixedB.body ?? "", rawCompareMixedH.body ?? ""),
      );
    });

    it("重命名：base/head 各拉 old/new 路径，展示路径为 new_path", async () => {
      registerCompareResponse(mock.scenario, "p/ren", "rb", "rh", compareRename);
      registerRawScenario(mock.scenario, rawCompareRenB);
      registerRawScenario(mock.scenario, rawCompareRenH);

      const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: tok });
      const cmp = await adapter.getCompare("p/ren", "rb", "rh");

      expect(cmp.changedFiles).toHaveLength(1);
      expect(cmp.changedFiles[0]?.path).toBe("src/new.ts");
      expect(cmp.changedFiles[0]).toMatchObject(
        lineBucketsFromTexts(rawCompareRenB.body ?? "", rawCompareRenH.body ?? ""),
      );
    });

    it("同 ref 比较：commitList 仅一条，changedFiles 为空", async () => {
      registerCompareResponse(mock.scenario, "p/empty", "main", "main", compareEmpty);
      const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: tok });
      const cmp = await adapter.getCompare("p/empty", "main", "main");
      expect(cmp.commitList).toEqual(["eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]);
      expect(cmp.changedFiles).toEqual([]);
    });

    it("白名单文件 >8 时 getCompare 走 archive.zip 拉 base/head", async () => {
      registerCompareResponse(mock.scenario, "p/nine", "baseNine", "headNine", compareNineTs);
      registerArchiveScenario(mock.scenario, archiveCompareNineBase);
      registerArchiveScenario(mock.scenario, archiveCompareNineHead);

      const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: tok });
      const cmp = await adapter.getCompare("p/nine", "baseNine", "headNine");

      expect(
        mock.requestLog.filter((e) => e.path.endsWith("/repository/archive.zip")),
      ).toHaveLength(2);
      expect(cmp.changedFiles).toHaveLength(9);
      const f1 = cmp.changedFiles.find((c) => c.path === "f1.ts");
      expect(f1?.additions.length).toBeGreaterThan(0);
    });

    it("compare 接口 404 时抛出 HttpError", async () => {
      const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: tok });
      await expect(adapter.getCompare("p/x", "a", "b")).rejects.toMatchObject({
        name: "HttpError",
        status: 404,
        data: errCompareNotFound,
      });
    });

    it("getCommitsBetween：与 compare 返回的 commits 顺序一致", async () => {
      registerCompareResponse(mock.scenario, "p/cb", "baseR", "headR", compareCommitsBetween);
      const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: tok });
      const shas = await adapter.getCommitsBetween("p/cb", "baseR", "headR");
      expect(shas).toEqual([
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "cccccccccccccccccccccccccccccccccccccccc",
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ]);
      expect(mock.requestLog.filter((e) => e.path.endsWith("/repository/compare"))).toHaveLength(1);
      expect(mock.requestLog.some((e) => e.path.endsWith("/repository/commits"))).toBe(false);
    });

    it("getCommitsBetween：仅请求 compare，不访问 repository/commits", async () => {
      const baseSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const headSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      registerCompareResponse(mock.scenario, "p/sha", baseSha, headSha, compareCommitsBetween);
      const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: tok });
      mock.clearLog();
      await adapter.getCommitsBetween("p/sha", baseSha, headSha);
      expect(mock.requestLog.filter((e) => e.path.endsWith("/repository/compare"))).toHaveLength(1);
      expect(mock.requestLog.some((e) => e.path.endsWith("/repository/commits"))).toBe(false);
    });
  });
});
