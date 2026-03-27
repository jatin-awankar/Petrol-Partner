import { frontendConfig } from "../frontend-config";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(input: {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
  }
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${frontendConfig.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

const AUTH_ENDPOINTS_WITHOUT_RETRY = new Set([
  "/v1/auth/login",
  "/v1/auth/register",
  "/v1/auth/logout",
  "/v1/auth/refresh",
]);

type AuthFailureReason = "unauthorized_after_refresh";

let clientAuthFailureHandler: ((reason: AuthFailureReason) => void) | null = null;

function normalizePathname(path: string) {
  if (/^https?:\/\//i.test(path)) {
    try {
      return new URL(path).pathname;
    } catch {
      return path;
    }
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  const [pathnameOnly] = withLeadingSlash.split(/[?#]/, 1);
  return pathnameOnly;
}

function isRefreshRetryEligiblePath(path: string) {
  const pathname = normalizePathname(path);

  if (!pathname.startsWith("/v1/")) {
    return false;
  }

  return !AUTH_ENDPOINTS_WITHOUT_RETRY.has(pathname);
}

function applySetCookieToCookieHeader(
  currentCookieHeader: string | undefined,
  setCookieHeaders: string[],
) {
  const cookieMap = new Map<string, string>();

  for (const pair of (currentCookieHeader ?? "").split(";")) {
    const [rawName, ...rawValue] = pair.trim().split("=");

    if (!rawName || rawValue.length === 0) {
      continue;
    }

    cookieMap.set(rawName.trim(), rawValue.join("=").trim());
  }

  for (const setCookie of setCookieHeaders) {
    const [firstPart] = setCookie.split(";");
    const [rawName, ...rawValue] = firstPart.trim().split("=");

    if (!rawName || rawValue.length === 0) {
      continue;
    }

    cookieMap.set(rawName.trim(), rawValue.join("=").trim());
  }

  return [...cookieMap.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function tryClientRefreshSession() {
  const response = await fetch(buildUrl("/v1/auth/refresh"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });

  return response.ok;
}

function getSetCookieHeaders(response: Response) {
  const dynamicHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof dynamicHeaders.getSetCookie === "function") {
    return dynamicHeaders.getSetCookie();
  }

  const singleHeader = response.headers.get("set-cookie");
  return singleHeader ? [singleHeader] : [];
}

export function setClientAuthFailureHandler(
  handler: ((reason: AuthFailureReason) => void) | null,
) {
  clientAuthFailureHandler = handler;
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

function toApiError(response: Response, body: any) {
  const message =
    body?.error?.message ??
    body?.message ??
    body?.error ??
    `Request failed with status ${response.status}`;

  return new ApiError({
    status: response.status,
    code: body?.error?.code,
    details: body?.error?.details ?? body?.details,
    message,
  });
}

function toNetworkError(path: string, error: unknown) {
  const message =
    error instanceof Error && error.message
      ? `Unable to reach backend API for ${path}: ${error.message}`
      : `Unable to reach backend API for ${path}`;

  return new ApiError({
    status: 503,
    code: "BACKEND_UNREACHABLE",
    message,
    details: error,
  });
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { skipJsonBody?: boolean; _retryAttempted?: boolean } = {},
) {
  const headers = new Headers(init.headers ?? {});

  if (!headers.has("Content-Type") && !init.skipJsonBody && init.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      ...init,
      credentials: "include",
      headers,
      cache: init.cache ?? "no-store",
    });
  } catch (error) {
    throw toNetworkError(path, error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (
    response.status === 401 &&
    !init._retryAttempted &&
    isRefreshRetryEligiblePath(path)
  ) {
    const refreshSucceeded = await tryClientRefreshSession();

    if (refreshSucceeded) {
      return apiRequest<T>(path, {
        ...init,
        _retryAttempted: true,
      });
    }
  }

  const body = await parseResponseBody(response);

  if (!response.ok) {
    if (
      response.status === 401 &&
      isRefreshRetryEligiblePath(path) &&
      init._retryAttempted &&
      clientAuthFailureHandler
    ) {
      clientAuthFailureHandler("unauthorized_after_refresh");
    }

    throw toApiError(response, body);
  }

  return body as T;
}

export async function serverApiRequest<T>(
  path: string,
  init: RequestInit & {
    cookieHeader?: string;
    _retryAttempted?: boolean;
  } = {},
) {
  const headers = new Headers(init.headers ?? {});

  if (init.cookieHeader) {
    headers.set("cookie", init.cookieHeader);
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers,
      cache: init.cache ?? "no-store",
    });
  } catch (error) {
    throw toNetworkError(path, error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (
    response.status === 401 &&
    !init._retryAttempted &&
    isRefreshRetryEligiblePath(path) &&
    init.cookieHeader
  ) {
    const refreshResponse = await fetch(buildUrl("/v1/auth/refresh"), {
      method: "POST",
      headers: {
        cookie: init.cookieHeader,
      },
      cache: "no-store",
    });

    if (refreshResponse.ok) {
      const refreshedCookieHeader = applySetCookieToCookieHeader(
        init.cookieHeader,
        getSetCookieHeaders(refreshResponse),
      );

      if (refreshedCookieHeader) {
        return serverApiRequest<T>(path, {
          ...init,
          cookieHeader: refreshedCookieHeader,
          _retryAttempted: true,
        });
      }
    }
  }

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw toApiError(response, body);
  }

  return body as T;
}
