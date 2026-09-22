const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN_STORAGE_KEY = "ayitipay_developer_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  apiKey?: string;
}

// Shared fetch wrapper for the portal's own internal `/portal/*`/`/auth/*`
// API (JWT-authenticated). The public `/v1/*` API-key surface is called
// separately by the docs try-it console via `callPublicApi` below.
export async function callPortalApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? getStoredToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? "UNKNOWN_ERROR", data?.error?.message ?? "Request failed.");
  }
  return data as T;
}

// Calls the public `/v1/*` API using a developer's own API key — used by the
// docs "try it" console to exercise the exact same surface external
// developers use.
export async function callPublicApi<T>(path: string, apiKey: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? "UNKNOWN_ERROR", data?.error?.message ?? "Request failed.");
  }
  return data as T;
}

export { API_URL };
