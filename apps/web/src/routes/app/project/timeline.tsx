import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { Link } from 'react-router';
import { BandBadge } from '@/components/band-badge';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { altText } from '@/lib/assets';
import { assetsQuery } from '@/lib/queries';
import { groupByMonthAndSite } from '@/lib/timeline';
import { useProject } from './project-layout';

export function ProjectTimeline() {
  const { project, openAsset } = useProject();
  const { data: assets, isPending, error } = useQuery(assetsQuery(project.id));

  if (isPending) {
    return (
      <div className="space-y-6" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (error) return <FormError message={`Couldn’t load the timeline: ${error.message}`} />;
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No evidence on the timeline yet"
        action={
          <Button asChild>
            <Link to="../evidence">Upload evidence</Link>
          </Button>
        }
      >
        Evidence appears here by the month it was taken, grouped by site.
      </EmptyState>
    );
  }

  return (
    <ol className="relative space-y-10 border-l pl-6 sm:pl-8">
      {groupByMonthAndSite(assets).map((month) => (
        <li key={month.key} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[31px] size-3 rounded-full border-2 border-background bg-primary sm:-left-[39px]"
          />
          <h2 className="font-display text-2xl tracking-tight">{month.label}</h2>
          <div className="mt-4 space-y-5">
            {month.sites.map((site) => (
              <section key={site.name} aria-label={`${site.name}, ${month.label}`}>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {site.name} · {site.assets.length} {site.assets.length === 1 ? 'file' : 'files'}
                </h3>
                <ul className="mt-2 flex gap-3 overflow-x-auto pb-2">
                  {site.assets.map((a) => (
                    <li key={a.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => openAsset(a.id)}
                        className="group relative block size-28 overflow-hidden rounded-xl border bg-muted sm:size-32"
                        aria-label={`${altText(a)}. Open details`}
                      >
                        <img
                          src={a.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                        <BandBadge
                          band={a.trustBand}
                          className="absolute right-1.5 bottom-1.5 px-1.5 text-[10px]"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
