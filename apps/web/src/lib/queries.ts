import {
  healthResponseSchema,
  projectListResponse,
  projectSummarySchema,
  publicStatsSchema,
  sessionResponse,
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
