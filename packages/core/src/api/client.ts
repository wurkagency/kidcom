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
    // X-Kinnd-Client: the API refuses state-changing requests without it
    // (CSRF defence — apps/api/src/middleware/clientHeader.ts).
    headers: {
      "X-Kinnd-Client": "1",
      ...(body === undefined || isForm ? {} : { "Content-Type": "application/json" }),
    },
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

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * POSTs a form (a file upload) reporting progress as a 0–1 fraction. fetch
 * can't report upload progress, so this uses XMLHttpRequest, with the same
 * cookie, CSRF header and error shape as every other call.
 */
export function uploadForm<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(path));
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Kinnd-Client", "1");
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      const data = parseBody(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      const message =
        data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : `Request failed (${xhr.status})`;
      reject(new ApiError(xhr.status, message, data));
    };
    xhr.onerror = () => reject(new ApiError(0, "Upload failed", null));
    xhr.onabort = () => reject(new ApiError(0, "Upload cancelled", null));
    xhr.send(form);
  });
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
