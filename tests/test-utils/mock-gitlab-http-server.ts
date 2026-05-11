import { createServer, type IncomingMessage, type Server } from "node:http";
import errCompareNotFound from "./fixtures/gitlab/api/errors/compare-not-found.json";
import errArchiveNotFound from "./fixtures/gitlab/api/errors/archive-not-found.json";
import errHandler from "./fixtures/gitlab/api/errors/handler-error.json";
import errInternal from "./fixtures/gitlab/api/errors/internal-server.json";
import errMethodNotAllowed from "./fixtures/gitlab/api/errors/method-not-allowed.json";
import errNoRoute from "./fixtures/gitlab/api/errors/no-route.json";
import errNotFound from "./fixtures/gitlab/api/errors/not-found.json";
import errNotFoundProject from "./fixtures/gitlab/api/errors/not-found-project.json";

export type MockRequestLogEntry = {
  method: string;
  path: string;
  search: string;
  token: string | null;
};

export type GitlabMockScenario = {
  /** `repoId` 与适配器传入的 `encodeURIComponent(repoID)` 段一致（未二次编码） */
  projects: Map<string, { id: number; path_with_namespace: string; description?: string }>;
  raw404: Set<string>;
  raw500: Set<string>;
  /** key: `${repoId}\n${ref}\n${filePath}`（filePath 为解码后的仓库相对路径） */
  rawBody: Map<string, string>;
  /** key: `${repoId}\n${sha}` → zip 二进制 */
  archives: Map<string, Buffer>;
  /** key: `${repoId}\n${from}\n${to}` → GitLab compare API 200 JSON */
  compareResponses: Map<string, unknown>;
  /** key: `${repoId}\n${commitRef}` → `GET .../repository/commits/:sha` 200 JSON 单对象（path 段经 decodeURIComponent 后的 sha/分支/tag） */
  commits: Map<string, unknown>;
};

export function createEmptyScenario(): GitlabMockScenario {
  return {
    projects: new Map(),
    raw404: new Set(),
    raw500: new Set(),
    rawBody: new Map(),
    archives: new Map(),
    compareResponses: new Map(),
    commits: new Map(),
  };
}

export function resetScenario(scenario: GitlabMockScenario): void {
  scenario.projects.clear();
  scenario.raw404.clear();
  scenario.raw500.clear();
  scenario.rawBody.clear();
  scenario.archives.clear();
  scenario.compareResponses.clear();
  scenario.commits.clear();
}

export function rawMapKey(repoId: string, ref: string, filePath: string): string {
  return `${repoId}\n${ref}\n${filePath}`;
}

export function archiveMapKey(repoId: string, sha: string): string {
  return `${repoId}\n${sha}`;
}

export function compareMapKey(repoId: string, from: string, to: string): string {
  return `${repoId}\n${from}\n${to}`;
}

export function commitMapKey(repoId: string, commitRef: string): string {
  return `${repoId}\n${commitRef}`;
}

export type GitlabMockServer = {
  /** 适配器构造用的 `base`，已含 `/api/v4`，无尾部斜杠 */
  baseUrl: string;
  scenario: GitlabMockScenario;
  requestLog: MockRequestLogEntry[];
  clearLog(): void;
  close(): Promise<void>;
};

function readToken(req: IncomingMessage): string | null {
  const h = req.headers["private-token"];
  if (h == null) return null;
  return Array.isArray(h) ? (h[0] ?? null) : h;
}

/**
 * 本机 HTTP 服务，路由形态对齐 GitLab REST API，供集成测试走真实 `fetch` / `axios`。
 */
export async function startGitlabMockServer(): Promise<GitlabMockServer> {
  const scenario = createEmptyScenario();
  const requestLog: MockRequestLogEntry[] = [];

  const server: Server = createServer((req, res) => {
    const host = req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const token = readToken(req);
    requestLog.push({
      method: req.method ?? "GET",
      path: url.pathname,
      search: url.search,
      token,
    });

    const sendJson = (status: number, body: unknown) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      });
      res.end(payload);
    };

    try {
      if (req.method !== "GET") {
        sendJson(405, errMethodNotAllowed);
        return;
      }

      const projectMeta = /^\/api\/v4\/projects\/([^/]+)$/.exec(url.pathname);
      if (projectMeta) {
        const repoSeg = projectMeta[1] as string;
        const repoId = decodeURIComponent(repoSeg);
        const row = scenario.projects.get(repoId);
        if (!row) {
          sendJson(404, errNotFoundProject);
          return;
        }
        sendJson(200, row);
        return;
      }

      const rawFile = /^\/api\/v4\/projects\/([^/]+)\/repository\/files\/([^/]+)\/raw$/.exec(
        url.pathname,
      );
      if (rawFile) {
        const repoSeg = rawFile[1] as string;
        const fileSeg = rawFile[2] as string;
        const repoId = decodeURIComponent(repoSeg);
        const filePath = decodeURIComponent(fileSeg);
        const ref = url.searchParams.get("ref") ?? "";
        const key = rawMapKey(repoId, ref, filePath);
        if (scenario.raw500.has(key)) {
          sendJson(500, errInternal);
          return;
        }
        if (scenario.raw404.has(key)) {
          sendJson(404, errNotFound);
          return;
        }
        const text = scenario.rawBody.get(key);
        if (text === undefined) {
          sendJson(404, errNotFound);
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Content-Length": Buffer.byteLength(text),
        });
        res.end(text);
        return;
      }

      const archive = /^\/api\/v4\/projects\/([^/]+)\/repository\/archive\.zip$/.exec(url.pathname);
      if (archive) {
        const repoSeg = archive[1] as string;
        const repoId = decodeURIComponent(repoSeg);
        const sha = url.searchParams.get("sha") ?? "";
        const zip = scenario.archives.get(archiveMapKey(repoId, sha));
        if (!zip) {
          sendJson(404, errArchiveNotFound);
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": zip.length,
        });
        res.end(zip);
        return;
      }

      const compareMatch = /^\/api\/v4\/projects\/([^/]+)\/repository\/compare$/.exec(url.pathname);
      if (compareMatch) {
        const repoSeg = compareMatch[1] as string;
        const repoId = decodeURIComponent(repoSeg);
        const from = url.searchParams.get("from") ?? "";
        const to = url.searchParams.get("to") ?? "";
        const payload = scenario.compareResponses.get(compareMapKey(repoId, from, to));
        if (payload === undefined) {
          sendJson(404, errCompareNotFound);
          return;
        }
        sendJson(200, payload);
        return;
      }

      const commitMatch =
        /^\/api\/v4\/projects\/([^/]+)\/repository\/commits\/([^/]+)$/.exec(url.pathname);
      if (commitMatch) {
        const repoSeg = commitMatch[1] as string;
        const shaSeg = commitMatch[2] as string;
        const repoId = decodeURIComponent(repoSeg);
        const commitRef = decodeURIComponent(shaSeg);
        const payload = scenario.commits.get(commitMapKey(repoId, commitRef));
        if (payload === undefined) {
          sendJson(404, errNoRoute);
          return;
        }
        sendJson(200, payload);
        return;
      }

      sendJson(404, errNoRoute);
    } catch {
      sendJson(500, errHandler);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const addr = server.address();
  if (addr == null || typeof addr === "string") {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    throw new Error("mock server address unavailable");
  }

  const baseUrl = `http://127.0.0.1:${addr.port}/api/v4`;

  return {
    baseUrl,
    scenario,
    requestLog,
    clearLog() {
      requestLog.length = 0;
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
