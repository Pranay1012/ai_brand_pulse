import type { Action, IssueCluster, Mention, TrackedBrand, User, Workspace, Role } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If unauthorized, clean stale token
    setToken(null);
  }

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      errorDetail = errJson.error || errJson.message || errorDetail;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export const api = {
  health: () => request<{ status: string; db: string }>('/health'),

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

    me: () =>
      request<{ user: User; workspace: Workspace; role: Role }>('/api/auth/me'),
  },

  brands: {
    list: () => request<TrackedBrand[]>('/api/brands'),

    create: (data: { name: string; keywords: string[]; competitor_names?: string[] }) =>
      request<TrackedBrand>('/api/brands', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  clusters: {
    list: (params?: { status?: string; brand_id?: string }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.brand_id) query.set('brand_id', params.brand_id);
      const qs = query.toString();
      return request<IssueCluster[]>(`/api/clusters${qs ? `?${qs}` : ''}`);
    },

    get: (id: string) =>
      request<{ cluster: IssueCluster; mentions: Mention[]; actions: Action[] }>(`/api/clusters/${id}`),

    mentions: (id: string) =>
      request<Mention[]>(`/api/clusters/${id}/mentions`),

    stats: (params?: { brand_id?: string }) => {
      const query = new URLSearchParams();
      if (params?.brand_id) query.set('brand_id', params.brand_id);
      const qs = query.toString();
      return request<{
        total_mentions: number;
        total_clusters: number;
        critical_clusters: number;
        avg_negative_ratio: number;
      }>(`/api/clusters/stats${qs ? `?${qs}` : ''}`);
    },
  },

  actions: {
    list: (params?: { status?: string; brand_id?: string }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.brand_id) query.set('brand_id', params.brand_id);
      const qs = query.toString();
      return request<Action[]>(`/api/actions${qs ? `?${qs}` : ''}`);
    },

    get: (id: string) => request<Action>(`/api/actions/${id}`),

    approve: (id: string, payload?: unknown) =>
      request<Action>(`/api/actions/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ payload }),
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

