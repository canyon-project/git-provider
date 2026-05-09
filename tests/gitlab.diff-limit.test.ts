import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/diff-line", async (importOriginal) => {
  const a = await importOriginal<typeof import("../src/diff-line")>();
  return {
    ...a,
    LINE_DIFF_MAX_FILTERED_FILES: 2,
    LINE_DIFF_MAX_LINES_PER_FILE_SIDE: 2,
  };
});

import { GitlabAdapter } from "../src/gitlab";
import compareOneFatTs from "./test-utils/fixtures/gitlab/api/compare/one-fat-ts.json";
import compareThreeTs from "./test-utils/fixtures/gitlab/api/compare/three-ts.json";
import rawFatBf from "./test-utils/fixtures/gitlab/scenario/raw/compare-p-fat-bf-v.json";
import rawFatHf from "./test-utils/fixtures/gitlab/scenario/raw/compare-p-fat-hf-v.json";
import {
  resetScenario,
  startGitlabMockServer,
  type GitlabMockServer,
} from "./test-utils/mock-gitlab-http-server";
import { registerCompareResponse, registerRawScenario } from "./test-utils/register-gitlab-fixture";

/** 覆盖 `getCompare` 在 diff-line 上限附近的行为（需单独 mock 常量，避免巨型 fixture） */
describe("GitlabAdapter.getCompare（LINE_DIFF_MAX_* 缩小）", () => {
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

  it("白名单文件数 > LINE_DIFF_MAX_FILTERED_FILES 时不拉正文，行号为空", async () => {
    registerCompareResponse(mock.scenario, "p/t3", "xb", "xh", compareThreeTs);

    const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: "t" });
    const cmp = await adapter.getCompare("p/t3", "xb", "xh");

    expect(cmp.changedFiles).toHaveLength(3);
    expect(
      cmp.changedFiles.every((c) => c.additions.length === 0 && c.deletions.length === 0),
    ).toBe(true);
    expect(mock.requestLog.some((e) => e.path.includes("/repository/files/"))).toBe(false);
    expect(mock.requestLog.some((e) => e.path.endsWith("/repository/archive.zip"))).toBe(false);
  });

  it("单文件未超个数上限但单行数超 LINE_DIFF_MAX_LINES_PER_FILE_SIDE 时行号为空", async () => {
    registerCompareResponse(mock.scenario, "p/fat", "bf", "hf", compareOneFatTs);
    registerRawScenario(mock.scenario, rawFatBf);
    registerRawScenario(mock.scenario, rawFatHf);

    const adapter = new GitlabAdapter({ type: "gitlab", base: mock.baseUrl, token: "t" });
    const cmp = await adapter.getCompare("p/fat", "bf", "hf");

    expect(cmp.changedFiles).toHaveLength(1);
    expect(cmp.changedFiles[0]?.additions).toEqual([]);
    expect(cmp.changedFiles[0]?.deletions).toEqual([]);
    expect(
      mock.requestLog.filter((e) => e.path.includes("/repository/files/")).length,
    ).toBeGreaterThan(0);
  });
});
