import { describeEvent, eventPayloadSchema, type LiveEvent, type Metrics } from '@pramaan/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CircleCheck,
  FileText,
  ImageUp,
  MapPinOff,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { BandBadge } from '@/components/band-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { altText } from '@/lib/assets';
import { relativeTime } from '@/lib/format';
import { eventsQuery, reviewQueueQuery } from '@/lib/queries';

const EVENT_ICON: Record<LiveEvent['type'], LucideIcon> = {
  'asset.created': ImageUp,
  'asset.rescored': RefreshCw,
  'asset.reviewed': CircleCheck,
  'asset.enriched': Tags,
  'report.created': FileText,
  'settings.updated': Settings2,
  'site.gap_changed': MapPinOff,
};

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border bg-card p-5 shadow-soft">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold tracking-tight">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
        </h2>
        {action}
      </header>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}

export function ActivityFeed({ projectId }: { projectId?: string }) {
  const { data: events, isPending } = useQuery(eventsQuery(projectId, 6));
  return (
    <Panel title="Live activity" icon={Activity}>
      {isPending ? (
        <ListSkeleton />
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Uploads, re-scores and reviews appear here the moment they happen.
        </p>
      ) : (
        <ol className="space-y-3" aria-live="polite">
          {events.map((e) => {
            const Icon = EVENT_ICON[e.type];
            const payload = eventPayloadSchema.parse(e.payload);
            return (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted">
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="leading-snug">
                    {payload.projectId ? (
                      <Link to={`/app/projects/${payload.projectId}`} className="hover:underline">
                        {describeEvent(e)}
                      </Link>
                    ) : (
                      describeEvent(e)
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {payload.actorName && `${payload.actorName} · `}
                    <time dateTime={e.createdAt}>{relativeTime(e.createdAt)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function ReviewQueuePreview({ total }: { total: number }) {
  const { data: assets, isPending } = useQuery(reviewQueueQuery(undefined, 5));
  return (
    <Panel
      title="Needs review"
      icon={ShieldAlert}
      action={
        <span className="text-sm text-muted-foreground tabular">{total.toLocaleString()}</span>
      }
    >
      {isPending ? (
        <ListSkeleton />
      ) : !assets || assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing waiting. Evidence that scores below “verified” lands here for an admin to approve
          or reject.
        </p>
      ) : (
        <ul className="space-y-3">
          {assets.map((a) => (
            <li key={a.id}>
              <Link
                to={`/app/projects/${a.projectId}/review`}
                className="flex items-center gap-3 rounded-xl p-1 -m-1 hover:bg-accent"
              >
                <img
                  src={a.thumbnailUrl}
                  alt={altText(a)}
                  loading="lazy"
                  className="size-11 shrink-0 rounded-lg bg-muted object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.projectName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.siteName ?? 'No site'} · score {a.trustScore}
                  </p>
                </div>
                <BandBadge band={a.trustBand} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function GapAlerts({ gaps }: { gaps: Metrics['gapSites'] }) {
  return (
    <Panel title="Documentation gaps" icon={MapPinOff}>
      {gaps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every site in an active project has recent verified evidence.
        </p>
      ) : (
        <ul className="space-y-3">
          {gaps.map((g) => (
            <li key={g.siteId}>
              <Link
                to={`/app/projects/${g.projectId}/sites`}
                className="-m-1 flex items-start gap-3 rounded-xl p-1 hover:bg-accent"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-review-soft text-review">
                  <MapPinOff className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{g.siteName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {g.projectName} · {g.reason}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
