import type {
  Action,
  ClusterDetail,
  IssueCluster,
  Mention,
  Role,
  TrackedBrand,
  User,
  Workspace,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function getToken(): string | null {
  return localStorage.getItem('bp_token');
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem('bp_token', token);
  } else {
    localStorage.removeItem('bp_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    const hadToken = Boolean(getToken());
    // Clear stale token and notify AuthContext if an active session expired
    setToken(null);
    if (
      hadToken &&
      !endpoint.startsWith('/api/auth/login') &&
      !endpoint.startsWith('/api/auth/register')
    ) {
      unauthorizedHandler?.();
    }
  }

  if (!response.ok) {
    let errorDetail = response.statusText || `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        const errJson = JSON.parse(text) as { error?: string; message?: string };
        errorDetail = errJson.error || errJson.message || errorDetail;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  health: (signal?: AbortSignal) =>
    request<{ status: string; db: string }>('/health', { signal }),

  auth: {
    login: (credentials: { email: string; password: string }) =>
      request<{ token: string; user: User; workspace: Workspace; role: Role }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),

    register: (data: { email: string; password: string; name: string }) =>
      request<{ token: string; user: User; workspace: Workspace; role: Role }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    me: (signal?: AbortSignal) =>
      request<{ user: User; workspace: Workspace; role: Role }>('/api/auth/me', { signal }),
  },

  brands: {
    list: (signal?: AbortSignal) => request<TrackedBrand[]>('/api/brands', { signal }),

    create: (data: {
      name: string;
      keywords: string[];
      competitor_names?: string[];
      is_active?: boolean;
    }) =>
      request<TrackedBrand>('/api/brands', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (
      id: string,
      data: {
        name?: string;
        keywords?: string[];
        competitor_names?: string[];
        is_active?: boolean;
      },
    ) =>
      request<TrackedBrand>(`/api/brands/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/api/brands/${id}`, {
        method: 'DELETE',
      }),
  },

  clusters: {
    list: (params?: { status?: string; brand_id?: string }, signal?: AbortSignal) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.brand_id) query.set('brand_id', params.brand_id);
      const qs = query.toString();
      return request<IssueCluster[]>(`/api/clusters${qs ? `?${qs}` : ''}`, { signal });
    },

    get: (id: string, signal?: AbortSignal) =>
      request<ClusterDetail>(`/api/clusters/${id}`, { signal }),

    mentions: (id: string, signal?: AbortSignal) =>
      request<Mention[]>(`/api/clusters/${id}/mentions`, { signal }),

    stats: (params?: { brand_id?: string }, signal?: AbortSignal) => {
      const query = new URLSearchParams();
      if (params?.brand_id) query.set('brand_id', params.brand_id);
      const qs = query.toString();
      return request<{
        total_mentions: number;
        total_clusters: number;
        critical_clusters: number;
        avg_negative_ratio: number;
      }>(`/api/clusters/stats${qs ? `?${qs}` : ''}`, { signal });
    },
  },

  actions: {
    list: (params?: { status?: string; brand_id?: string }, signal?: AbortSignal) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.brand_id) query.set('brand_id', params.brand_id);
      const qs = query.toString();
      return request<Action[]>(`/api/actions${qs ? `?${qs}` : ''}`, { signal });
    },

    get: (id: string, signal?: AbortSignal) => request<Action>(`/api/actions/${id}`, { signal }),

    approve: (id: string, payload?: unknown) =>
      request<Action>(`/api/actions/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(payload !== undefined ? { payload } : {}),
      }),

    reject: (id: string, reason: string) =>
      request<Action>(`/api/actions/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    execute: (id: string) =>
      request<Action>(`/api/actions/${id}/execute`, {
        method: 'POST',
      }),
  },
};
