let csrfTokenCache: string | null = null;
let csrfTokenFetchPromise: Promise<string | null> | null = null;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface ApiOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
  body?: BodyInit | null;
  skipCsrf?: boolean;
  skipRedirect?: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchCsrfToken(): Promise<string | null> {
  if (csrfTokenCache) return csrfTokenCache;
  if (csrfTokenFetchPromise) return csrfTokenFetchPromise;

  csrfTokenFetchPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/csrf-token`, {
        credentials: 'include',
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      csrfTokenCache = data?.csrfToken ?? null;
      return csrfTokenCache;
    } catch {
      return null;
    } finally {
      csrfTokenFetchPromise = null;
    }
  })();

  return csrfTokenFetchPromise;
}

export function clearCsrfCache() {
  csrfTokenCache = null;
  csrfTokenFetchPromise = null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function readStoredUser(): { id: string; role: string; email?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  return readStoredUser();
}

export function setStoredUser(user: unknown) {
  if (typeof window === 'undefined') return;
  if (user == null) {
    window.localStorage.removeItem('user');
  } else {
    window.localStorage.setItem('user', JSON.stringify(user));
  }
}

export function clearStoredUser() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('user');
}

export async function api<T = unknown>(url: string, options: ApiOptions = {}): Promise<T> {
  const { json, body, skipCsrf, skipRedirect, headers, method, ...rest } = options;
  const upperMethod = (method ?? 'GET').toString().toUpperCase();

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  let finalBody: BodyInit | null | undefined = body;

  if (json !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(json);
  }

  if (!SAFE_METHODS.has(upperMethod) && !skipCsrf) {
    const hasBearer =
      typeof finalHeaders['Authorization'] === 'string' &&
      finalHeaders['Authorization'].startsWith('Bearer ');
    if (!hasBearer) {
      const csrf = await fetchCsrfToken();
      if (csrf) finalHeaders['X-XSRF-TOKEN'] = csrf;
    }
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...rest,
    method: upperMethod,
    credentials: 'include',
    headers: finalHeaders,
    body: finalBody,
  });

  if (res.status === 401 && !skipRedirect) {
    clearStoredUser();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data?.error || data?.message || message;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function apiDownload(url: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    method: 'GET',
  });
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }
  return res.blob();
}
