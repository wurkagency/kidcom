// The one place the app talks HTTP. Every request carries the session
// cookie; every non-2xx becomes an ApiError with the server's message.

let baseUrl = "/api";

/** Called once by CoreProvider. Dev proxies /api → the API; prod uses its origin. */
export function configureApi(options: { baseUrl: string }) {
  baseUrl = options.baseUrl.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export class ApiError extends Error {
  /** The server's machine-readable reason, when it gave one ("PASSWORD_REUSED"). */
  readonly code: string | undefined;
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.code =
      body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : undefined;
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(apiUrl(path), {
    method,
    credentials: "include",
    headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
