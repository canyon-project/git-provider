/** 默认请求超时（毫秒），与常见 axios 配置一致 */
export const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpRequestConfig = {
  /** 请求头 */
  headers?: HeadersInit;
  /** 超时毫秒数，缺省为 `DEFAULT_TIMEOUT_MS` */
  timeout?: number;
  /** 与内部超时合并；任一方 abort 都会中断请求（需运行环境支持 `AbortSignal.any`） */
  signal?: AbortSignal;
};

export type HttpResponse<T = unknown> = {
  data: T;
  status: number;
  statusText: string;
};

export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly data: unknown;

  constructor(status: number, statusText: string, data: unknown) {
    const detail =
      typeof data === "string"
        ? data
        : data != null && typeof data === "object"
          ? JSON.stringify(data)
          : data === undefined
            ? ""
            : String(data);
    super(detail ? `Request failed with ${status}: ${detail}` : `Request failed with ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

function mergeSignal(timeoutSignal: AbortSignal, userSignal?: AbortSignal): AbortSignal {
  if (!userSignal) return timeoutSignal;
  const any = (
    AbortSignal as typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal }
  ).any;
  if (typeof any === "function") {
    return any([userSignal, timeoutSignal]);
  }
  return timeoutSignal;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

type DispatchConfig = HttpRequestConfig & {
  method?: string;
  body?: BodyInit | null;
};

async function dispatch<T>(url: string | URL, config: DispatchConfig): Promise<HttpResponse<T>> {
  const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = mergeSignal(controller.signal, config.signal);

  try {
    const res = await fetch(url, {
      method: config.method ?? "GET",
      headers: config.headers,
      body: config.body,
      signal,
    });
    const data = await parseBody(res);
    if (!res.ok) {
      throw new HttpError(res.status, res.statusText, data);
    }
    return {
      data: data as T,
      status: res.status,
      statusText: res.statusText,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 类似 `axios.get`：返回 `{ data, status, statusText }`，非 2xx 抛 `HttpError` */
export function get<T = unknown>(
  url: string | URL,
  config: HttpRequestConfig = {},
): Promise<HttpResponse<T>> {
  return dispatch<T>(url, { ...config, method: "GET" });
}

/** `axios.post` 常见 JSON 用法：`body` 会被 `JSON.stringify`，并带上 `Content-Type: application/json` */
export function post<T = unknown>(
  url: string | URL,
  body?: unknown,
  config: HttpRequestConfig = {},
): Promise<HttpResponse<T>> {
  const headers = new Headers(config.headers as HeadersInit | undefined);
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return dispatch<T>(url, {
    ...config,
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 与 axios 默认导出类似的单对象入口（按需扩展 `put` / `delete` 等） */
const request = {
  defaults: { timeout: DEFAULT_TIMEOUT_MS },
  get,
  post,
};

export default request;
