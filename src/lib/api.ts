let csrfToken = "";
let csrfRequest: Promise<string> | null = null;

function csrfCookie() {
  if (typeof document === "undefined") return "";
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("csrftoken="))
    ?.slice("csrftoken=".length);
  return value ? decodeURIComponent(value) : "";
}

export async function ensureCsrf() {
  // Django rotates the CSRF cookie when a user logs in. Prefer the current
  // cookie over the in-memory value so later writes never reuse a pre-login
  // token. Keep one bootstrap request in flight for concurrent callers.
  const cookieToken = csrfCookie();
  if (cookieToken) {
    csrfToken = cookieToken;
    return csrfToken;
  }
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    csrfRequest = fetch("/backend-api/auth/csrf/", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to initialize security token.");
        csrfToken = (await response.json()).csrfToken;
        return csrfToken;
      })
      .finally(() => { csrfRequest = null; });
  }
  return csrfRequest;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRFToken", await ensureCsrf());
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`/backend-api${path}`, { ...options, method, headers, credentials: "include" });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || Object.values(body).flat().join(" ") || "Request failed.");
  return body as T;
}

export const jsonBody = (value: unknown) => JSON.stringify(value);
export function unwrap<T>(data: T[] | { results: T[] }): T[] { return Array.isArray(data) ? data : data.results; }
