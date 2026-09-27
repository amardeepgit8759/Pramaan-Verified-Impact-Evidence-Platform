import { healthResponseSchema } from '@pramaan/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from './api';

/** Every query key lives here so live-update events can invalidate them by name. */
export const queryKeys = {
  health: ['health'] as const,
};

export const healthQuery = queryOptions({
  queryKey: queryKeys.health,
  queryFn: ({ signal }) =>
    apiGet('/health', healthResponseSchema, { acceptErrorBody: true, signal }),
  refetchInterval: 30_000,
});
