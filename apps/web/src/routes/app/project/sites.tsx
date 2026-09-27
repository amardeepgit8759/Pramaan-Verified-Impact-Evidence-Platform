import type { Site } from '@pramaan/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Images, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { queryKeys, sitesQuery } from '@/lib/queries';
import { useProject } from './project-layout';
import { SiteDialog } from './site-dialog';

const SitesMap = lazy(() => import('@/components/map/sites-map'));

const formatRadius = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

export function ProjectSites() {
  const { project, isAdmin } = useProject();
  const { data: sites, isPending, error } = useQuery(sitesQuery(project.id));
  const [dialog, setDialog] = useState<{ site?: Site } | null>(null);

  const openCreate = () => setDialog({});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          GPS in each photo is checked against the site it belongs to.
        </p>
        {isAdmin && sites && sites.length > 0 && (
          <Button onClick={openCreate}>
            <Plus /> Add site
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]" aria-busy="true">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : error ? (
        <FormError message={`Couldn’t load sites: ${error.message}`} />
      ) : sites.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={isAdmin ? 'Add the first site' : 'No sites yet'}
          action={
            isAdmin ? (
              <Button onClick={openCreate}>
                <Plus /> Add site
              </Button>
            ) : undefined
          }
        >
          {isAdmin
            ? 'Mark each village, school or plot on the map with a radius. Evidence is automatically matched to the nearest site it falls inside.'
            : 'Your admin hasn’t added any sites to this project yet.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Suspense fallback={<Skeleton className="h-80 rounded-2xl lg:h-full" />}>
            <SitesMap sites={sites} className="h-80 lg:h-auto lg:min-h-96" />
          </Suspense>
          <ul className="grid content-start gap-3">
            {sites.map((site) => (
              <SiteRow
                key={site.id}
                site={site}
                isAdmin={isAdmin}
                onEdit={() => setDialog({ site })}
              />
            ))}
          </ul>
        </div>
      )}

      <SiteDialog
        projectId={project.id}
        site={dialog?.site}
        otherSites={sites ?? []}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </div>
  );
}

function SiteRow({ site, isAdmin, onEdit }: { site: Site; isAdmin: boolean; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete(`/sites/${site.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(site.projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects, exact: true });
      toast.success(`Deleted ${site.name}`);
      setConfirming(false);
    },
    onError: (err) => toast.error(`Couldn’t delete ${site.name}: ${err.message}`),
  });

  return (
    <li className="flex items-start gap-4 rounded-2xl border bg-card p-4 shadow-soft">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-verified-soft text-verified">
        <MapPin className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">{site.name}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground tabular">
          {site.lat.toFixed(4)}, {site.lng.toFixed(4)} · radius {formatRadius(site.radiusM)}
        </p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Images className="size-3.5" aria-hidden />
          {site.assetCount} {site.assetCount === 1 ? 'file' : 'files'}
        </p>
      </div>
      {isAdmin && (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${site.name}`}>
            <Pencil />
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${site.name}`}>
                <Trash2 />
              </Button>
            }
            title={`Delete ${site.name}?`}
            description={
              site.assetCount > 0
                ? `Its ${site.assetCount} evidence files stay in the project but are no longer tied to a site, so their location can’t be checked.`
                : 'This site has no evidence yet.'
            }
            confirmLabel="Delete site"
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </div>
      )}
    </li>
  );
}
