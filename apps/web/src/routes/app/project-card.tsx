import type { ProjectSummary } from '@pramaan/shared';
import { CalendarDays, Images, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { SdgChip } from '@/components/sdg-chip';
import { TrustBar } from '@/components/trust-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateRange } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_STYLE = {
  active: 'bg-verified-soft text-verified',
  completed: 'bg-secondary text-secondary-foreground',
  archived: 'bg-muted text-muted-foreground',
} as const;

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <article className="relative flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-soft transition-shadow duration-150 focus-within:shadow-lift hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-lg leading-snug font-semibold tracking-tight">
            {/* The whole card is clickable through this link's stretched hit area. */}
            <Link
              to={`/app/projects/${project.id}`}
              className="rounded-md outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {project.name}
            </Link>
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden />
            {formatDateRange(project.startDate, project.endDate)}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
            STATUS_STYLE[project.status],
          )}
        >
          {project.status}
        </span>
      </div>

      {project.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
      )}

      {project.sdgGoals.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="SDG goals">
          {project.sdgGoals.map((g) => (
            <li key={g}>
              <SdgChip goal={g} compact />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto space-y-4">
        <TrustBar bands={project.bands} />
        <dl className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-4 text-sm">
          <div className="flex items-center gap-1.5">
            <dt>
              <Images className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Evidence</span>
            </dt>
            <dd className="tabular">
              {project.assetCount.toLocaleString()} {project.assetCount === 1 ? 'file' : 'files'}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Sites</span>
            </dt>
            <dd className="tabular">
              {project.siteCount} {project.siteCount === 1 ? 'site' : 'sites'}
            </dd>
          </div>
          {project.averageTrust !== null && (
            <div className="flex items-center gap-1.5">
              <dt className="text-muted-foreground">Avg trust</dt>
              <dd className="font-medium tabular">{Math.round(project.averageTrust)}</dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  );
}

export function ProjectGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-busy="true">
      <span className="sr-only">Loading projects…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-5 rounded-2xl border bg-card p-6">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10" />
          <Skeleton className="h-2 rounded-full" />
        </div>
      ))}
    </div>
  );
}
