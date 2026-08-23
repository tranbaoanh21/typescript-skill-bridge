import type { ApiErrorBody, AuthResult } from './types';

const apiBaseUrl = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000/api/v1';
const sessionKey = 'skillbridge.session';

export type Session = AuthResult;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const readSession = (): Session | null => {
  const stored = sessionStorage.getItem(sessionKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as Session;
  } catch {
    sessionStorage.removeItem(sessionKey);
    return null;
  }
};

export const writeSession = (session: Session | null) => {
  if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
  else sessionStorage.removeItem(sessionKey);
  window.dispatchEvent(new Event('skillbridge:session'));
};

const parseError = async (response: Response) => {
  const fallback = new ApiError(
    'HTTP_ERROR',
    `Request failed with status ${response.status}.`,
    response.status,
  );
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(body.error.code, body.error.message, response.status, body.error.requestId);
  } catch {
    return fallback;
  }
};

const refreshSession = async () => {
  const session = readSession();
  if (!session?.tokens.refreshToken) return null;
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) {
    writeSession(null);
    return null;
  }
  const body = (await response.json()) as { data: AuthResult };
  writeSession(body.data);
  return body.data;
};

export const apiRequest = async <T>(
  path: string,
  options: RequestInit = {},
  allowRefresh = true,
): Promise<T> => {
  const session = readSession();
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');
  if (options.body) headers.set('content-type', 'application/json');
  if (session?.tokens.accessToken)
    headers.set('authorization', `Bearer ${session.tokens.accessToken}`);

  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) return apiRequest<T>(path, options, false);
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as { data: T };
  return body.data;
};

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { body: JSON.stringify(body), method: 'PATCH' }),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      method: 'POST',
    }),
  put: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { body: JSON.stringify(body), method: 'PUT' }),
};
