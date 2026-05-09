import axios, { type AxiosRequestConfig } from "axios";

export const DEFAULT_TIMEOUT_MS = 10_000;

/** 统一超时；需要改签名单独在调用里传 `AxiosRequestConfig` */
export const http = axios.create({ timeout: DEFAULT_TIMEOUT_MS });

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

function rethrowAsHttpError(e: unknown): never {
  if (axios.isAxiosError(e) && e.response) {
    throw new HttpError(e.response.status, e.response.statusText ?? "", e.response.data);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

export async function get<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<HttpResponse<T>> {
  try {
    const r = await http.get<T>(url, config);
    return { data: r.data, status: r.status, statusText: r.statusText };
  } catch (e) {
    rethrowAsHttpError(e);
  }
}

export async function post<T = unknown>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<HttpResponse<T>> {
  try {
    const r = await http.post<T>(url, body, config);
    return { data: r.data, status: r.status, statusText: r.statusText };
  } catch (e) {
    rethrowAsHttpError(e);
  }
}

export default { http, get, post, defaults: http.defaults };
