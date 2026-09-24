const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
// Session-authenticated calls use the same-origin proxy (see next.config.mjs).
const BACKEND = "/backend";

export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  retryAfter?: number;
  constructor(status: number, code: string, message: string, requestId?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

// The access token lives only in memory (never localStorage), so an XSS can't
// steal a long-lived credential. The refresh token is an httpOnly cookie the
// page can't read at all; it is exchanged for a new access token via /auth/refresh.
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function parse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function toError(res: Response, data: { error?: { code?: string; message?: string; request_id?: string; retry_after?: number } }) {
  return new ApiError(res.status, data.error?.code ?? "UNKNOWN_ERROR", data.error?.message ?? "Request failed.", data.error?.request_id, data.error?.retry_after);
}

export async function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = fetch(`${BACKEND}/auth/refresh`, { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await parse(res);
        accessToken = data.access_token ?? null;
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

interface Options {
  method?: string;
  body?: unknown;
}

// Dashboard/admin API (session-authenticated). Retries once after a silent
// refresh when the short-lived access token has expired.
export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const send = () =>
    fetch(`${BACKEND}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && !path.startsWith("/auth/")) {
    if (await refreshSession()) res = await send();
  }
  const data = await parse(res);
  if (!res.ok) throw toError(res, data);
  return data as T;
}

// Uploads one image (a KYC document photo) as the raw body. Same silent-refresh behaviour as api().
export async function uploadImage<T = any>(path: string, image: Blob): Promise<T> {
  const send = () =>
    fetch(`${BACKEND}${path}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": image.type || "image/jpeg", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: image,
    });
  let res = await send();
  if (res.status === 401) {
    if (await refreshSession()) res = await send();
  }
  const data = await parse(res);
  if (!res.ok) throw toError(res, data);
  return data as T;
}

// Fetches a protected image (an <img> tag can't send the Authorization header).
export async function apiBlob(path: string): Promise<Blob> {
  const send = () => fetch(`${BACKEND}${path}`, { credentials: "include", headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  let res = await send();
  if (res.status === 401) {
    if (await refreshSession()) res = await send();
  }
  if (!res.ok) throw toError(res, await parse(res));
  return res.blob();
}

export async function authRequest<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parse(res);
  if (!res.ok) throw toError(res, data);
  return data as T;
}

// Public /api/v1 with an API key — used by the docs "try it" console, exactly
// like a customer's own integration would. Only TEST keys belong in a browser.
export async function callPublicApi<T = any>(path: string, apiKey: string, options: Options & { headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...(options.headers ?? {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await parse(res);
  if (!res.ok) throw toError(res, data);
  return data as T;
}

export { API_URL };
