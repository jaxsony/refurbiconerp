import { useAuth } from './auth-store';

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  retry?: boolean;
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function refreshSession(): Promise<string | null> {
  const { refreshToken, profile, setSession, clear } = useAuth.getState();
  if (!refreshToken) {
    return null;
  }
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    clear();
    return null;
  }
  const data = (await response.json()) as { accessToken: string; refreshToken: string };
  if (profile) {
    setSession(data.accessToken, data.refreshToken, profile);
  }
  return data.accessToken;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    if (response.status === 401 && options.token && !options.retry) {
      const next = await refreshSession();
      if (next) {
        return api<T>(path, { ...options, token: next, retry: true });
      }
    }
    const payload = (await response.json().catch(() => ({}))) as { code?: string; message?: string | string[] };
    const message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
    throw new ApiError(response.status, payload.code ?? 'ERROR', message ?? response.statusText);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (!data || typeof data !== 'object') {
    return [];
  }
  const record = data as Record<string, unknown>;
  for (const key of ['items', 'data', 'rows', 'results']) {
    if (Array.isArray(record[key])) {
      return record[key] as T[];
    }
  }
  if (typeof record.id === 'string') {
    return [data as T];
  }
  return [];
}

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function asPage<T>(data: unknown): Page<T> {
  const items = asList<T>(data);
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as Page<T>).items)) {
    const page = data as Page<T>;
    return {
      items: page.items,
      total: page.total ?? page.items.length,
      page: page.page ?? 1,
      pageSize: page.pageSize ?? page.items.length,
      pageCount: page.pageCount ?? 1,
    };
  }
  return { items, total: items.length, page: 1, pageSize: items.length || 20, pageCount: 1 };
}
