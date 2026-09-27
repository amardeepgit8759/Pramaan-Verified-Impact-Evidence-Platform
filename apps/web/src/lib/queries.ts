import {
  assetDetailSchema,
  assetListResponse,
  eventListResponse,
  metricsSchema,
  healthResponseSchema,
  projectListResponse,
  projectSummarySchema,
  publicStatsSchema,
  sessionResponse,
  settingsResponse,
  siteListResponse,
  teamListResponse,
  type SessionResponse,
} from '@pramaan/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, ApiError } from './api';

/** Every query key lives here so live-update events can invalidate them by name. */
export const queryKeys = {
  health: ['health'] as const,
  session: ['session'] as const,
  publicStats: ['public-stats'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  sites: (projectId: string) => ['projects', projectId, 'sites'] as const,
  assets: (projectId: string, filters: Record<string, string> = {}) =>
    ['projects', projectId, 'assets', filters] as const,
  asset: (id: string) => ['assets', id] as const,
  /** Everything below also refreshes on every live event of the matching kind. */
  metrics: (projectId?: string) => ['metrics', projectId ?? 'all'] as const,
  events: (projectId?: string) => ['events', projectId ?? 'all'] as const,
  reviewQueue: (projectId?: string) => ['review-queue', projectId ?? 'all'] as const,
  settings: ['settings'] as const,
  team: ['team'] as const,
};

export const healthQuery = queryOptions({
  queryKey: queryKeys.health,
  queryFn: ({ signal }) =>
    api.get('/health', healthResponseSchema, { acceptErrorBody: true, signal }),
});

/** The signed-in user and org, or null when signed out. */
export const sessionQuery = queryOptions({
  queryKey: queryKeys.session,
  queryFn: async ({ signal }): Promise<SessionResponse | null> => {
    try {
      return await api.get('/auth/me', sessionResponse, { signal });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  staleTime: 5 * 60_000,
});

export const publicStatsQuery = queryOptions({
  queryKey: queryKeys.publicStats,
  queryFn: ({ signal }) => api.get('/public/stats', publicStatsSchema, { signal }),
  staleTime: 60_000,
});

export const projectsQuery = queryOptions({
  queryKey: queryKeys.projects,
  queryFn: async ({ signal }) =>
    (await api.get('/projects', projectListResponse, { signal })).projects,
});

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.project(id),
    queryFn: ({ signal }) => api.get(`/projects/${id}`, projectSummarySchema, { signal }),
  });

export const sitesQuery = (projectId: string) =>
  queryOptions({
    queryKey: queryKeys.sites(projectId),
    queryFn: async ({ signal }) =>
      (await api.get(`/projects/${projectId}/sites`, siteListResponse, { signal })).sites,
  });

export const settingsQuery = queryOptions({
  queryKey: queryKeys.settings,
  queryFn: ({ signal }) => api.get('/settings', settingsResponse, { signal }),
});

export const teamQuery = queryOptions({
  queryKey: queryKeys.team,
  queryFn: async ({ signal }) => (await api.get('/users', teamListResponse, { signal })).members,
});

export const assetsQuery = (projectId: string, filters: Record<string, string> = {}) =>
  queryOptions({
    queryKey: queryKeys.assets(projectId, filters),
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams(filters).toString();
      const path = `/projects/${projectId}/assets${qs ? `?${qs}` : ''}`;
      return (await api.get(path, assetListResponse, { signal })).assets;
    },
  });

export const assetQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.asset(id),
    queryFn: ({ signal }) => api.get(`/assets/${id}`, assetDetailSchema, { signal }),
  });

const scope = (projectId?: string) => (projectId ? `?projectId=${projectId}` : '');

export const metricsQuery = (projectId?: string) =>
  queryOptions({
    queryKey: queryKeys.metrics(projectId),
    queryFn: ({ signal }) => api.get(`/metrics${scope(projectId)}`, metricsSchema, { signal }),
  });

export const eventsQuery = (projectId?: string, limit = 15) =>
  queryOptions({
    queryKey: [...queryKeys.events(projectId), limit],
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ limit: String(limit), ...(projectId && { projectId }) });
      return (await api.get(`/events?${qs}`, eventListResponse, { signal })).events;
    },
  });

export const reviewQueueQuery = (projectId?: string, limit = 5) =>
  queryOptions({
    queryKey: [...queryKeys.reviewQueue(projectId), limit],
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ limit: String(limit), ...(projectId && { projectId }) });
      return (await api.get(`/review-queue?${qs}`, assetListResponse, { signal })).assets;
    },
  });
