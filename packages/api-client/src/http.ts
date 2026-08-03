export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip attaching the stored access token — used only for auth endpoints */
  skipAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Each app sets NEXT_PUBLIC_API_BASE_URL in its own .env.local
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ride-it:access-token");
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, skipAuth = false } = options;

  const token = skipAuth ? null : getAccessToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const errBody = await res.json();
      message = errBody.message ?? message;
      code = errBody.code;
    } catch {
      // response wasn't JSON — fall back to statusText
    }
    throw new ApiError(message, res.status, code);
  }

  // 204 No Content etc.
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
