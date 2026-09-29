import {
  describeEvent,
  eventPayloadSchema,
  EVENT_TYPES,
  liveEventSchema,
  type EventType,
  type LiveEvent,
} from '@pramaan/shared';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { queryKeys } from './queries';

/**
 * Which cached queries each event makes stale. Prefix keys: ['projects'] covers every
 * project summary, list, site list and evidence list under it.
 */
export function keysFor(event: LiveEvent): QueryKey[] {
  const payload = eventPayloadSchema.parse(event.payload);
  const common: QueryKey[] = [['metrics'], ['events'], ['search']];
  switch (event.type) {
    case 'asset.created':
    case 'asset.rescored':
    case 'asset.reviewed':
      return [
        ...common,
        queryKeys.projects,
        ['review-queue'],
        ...(payload.assetId ? [queryKeys.asset(payload.assetId)] : []),
      ];
    case 'report.created':
      return [
        ...common,
        ['reports'],
        payload.projectId ? queryKeys.project(payload.projectId) : queryKeys.projects,
      ];
    case 'settings.updated':
      return [...common, queryKeys.settings, queryKeys.projects, ['review-queue'], ['assets']];
    case 'site.gap_changed':
      return [...common, queryKeys.projects];
  }
}

/**
 * Events worth interrupting someone for, when someone else caused them. Reports are the
 * exception: they finish in the background, so whoever started one hears about it too.
 */
function toastFor(event: LiveEvent, myId: string | undefined) {
  const payload = eventPayloadSchema.parse(event.payload);
  const text = describeEvent(event);
  if (event.type === 'report.created') {
    if (event.payload.status === 'failed') toast.error(text);
    else toast.success(text);
    return;
  }
  if (payload.actorId && payload.actorId === myId) return;
  switch (event.type) {
    case 'asset.created':
      if (payload.band === 'flagged' || payload.band === 'review') toast.warning(text);
      break;
    case 'asset.rescored':
      if (payload.band === 'flagged' && payload.previousBand !== 'flagged') toast.warning(text);
      break;
    case 'settings.updated':
    case 'asset.reviewed':
      toast.info(text);
      break;
    case 'site.gap_changed':
      if (payload.gap) toast.warning(text);
      break;
  }
}

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

/**
 * Keep the app's data live: listen to /api/stream and refresh exactly the queries each
 * event affects. The browser reconnects on its own and resumes from Last-Event-ID.
 */
export function useLiveEvents(myId: string | undefined): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    if (!myId) return;
    const source = new EventSource('/api/stream');
    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus('reconnecting');

    const onEvent = (e: MessageEvent<string>) => {
      const parsed = liveEventSchema.safeParse(JSON.parse(e.data));
      if (!parsed.success) return;
      for (const queryKey of keysFor(parsed.data)) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toastFor(parsed.data, myId);
    };
    for (const type of EVENT_TYPES) source.addEventListener(type satisfies EventType, onEvent);

    return () => source.close();
  }, [myId, queryClient]);

  return status;
}
