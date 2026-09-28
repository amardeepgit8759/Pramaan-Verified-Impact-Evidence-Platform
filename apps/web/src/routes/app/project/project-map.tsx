import { TRUST_BANDS } from '@pramaan/shared';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BAND_META } from '@/lib/bands';
import { assetsQuery, sitesQuery } from '@/lib/queries';
import { useProject } from './project-layout';

const EvidenceMap = lazy(() => import('@/components/map/evidence-map'));

export function ProjectMap() {
  const { project, openAsset } = useProject();
  const sites = useQuery(sitesQuery(project.id));
  const assets = useQuery(assetsQuery(project.id));

  if (sites.isPending || assets.isPending) {
    return <Skeleton className="h-[28rem] rounded-2xl lg:h-[34rem]" aria-busy="true" />;
  }
  if (sites.error || assets.error) {
    return (
      <FormError message={`Couldn’t load the map: ${(sites.error ?? assets.error)!.message}`} />
    );
  }
  if (sites.data.length === 0 && assets.data.every((a) => a.lat === null)) {
    return (
      <EmptyState
        icon={MapPin}
        title="Nothing to map yet"
        action={
          <Button asChild variant="outline">
            <Link to="../sites">Add a site</Link>
          </Button>
        }
      >
        Sites appear as circles and evidence with GPS as pins, coloured by trust band.
      </EmptyState>
    );
  }

  const withoutGps = assets.data.filter((a) => a.lat === null || a.lng === null).length;
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-full border-2 border-primary bg-primary/15" />
          Site and its radius
        </li>
        {TRUST_BANDS.map((b) => {
          const { label, icon: Icon, text } = BAND_META[b];
          return (
            <li key={b} className="flex items-center gap-1.5">
              <Icon className={`size-4 ${text}`} aria-hidden />
              {label}
            </li>
          );
        })}
      </ul>
      <Suspense fallback={<Skeleton className="h-[28rem] rounded-2xl lg:h-[34rem]" />}>
        <EvidenceMap sites={sites.data} assets={assets.data} onOpenAsset={openAsset} />
      </Suspense>
      {withoutGps > 0 && (
        <p className="text-sm text-muted-foreground">
          {withoutGps} {withoutGps === 1 ? 'file has' : 'files have'} no GPS and{' '}
          {withoutGps === 1 ? 'isn’t' : 'aren’t'} shown on the map.
        </p>
      )}
    </div>
  );
}
