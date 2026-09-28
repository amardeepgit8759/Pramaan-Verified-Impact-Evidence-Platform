import type { ProjectSummary } from '@pramaan/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, FolderX, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { SdgChip } from '@/components/sdg-chip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatDateRange } from '@/lib/format';
import { projectQuery, queryKeys } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { EditProjectDialog } from '../create-project-dialog';
import { AssetDrawer } from './asset-drawer';

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'evidence', label: 'Evidence', end: false },
  { to: 'map', label: 'Map', end: false },
  { to: 'timeline', label: 'Timeline', end: false },
  { to: 'compare', label: 'Compare', end: false },
  { to: 'review', label: 'Review', end: false },
  { to: 'sites', label: 'Sites', end: false },
];

export interface ProjectContext {
  project: ProjectSummary;
  isAdmin: boolean;
  /** Open evidence in the detail drawer (kept in the URL, so it can be shared). */
  openAsset: (id: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProject = () => useOutletContext<ProjectContext>();

export function ProjectLayout() {
  const { projectId = '' } = useParams();
  const { data: session } = useSession();
  const { data: project, isPending, error } = useQuery(projectQuery(projectId));
  const isAdmin = session?.user.role === 'admin';
  const [params, setParams] = useSearchParams();
  const openAssetId = params.get('asset');
  const setAsset = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('asset', id);
        else next.delete('asset');
        return next;
      },
      { replace: id === null },
    );

  if (isPending) return <ProjectSkeleton />;
  if (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <EmptyState
        icon={FolderX}
        title={missing ? 'Project not found' : 'Couldn’t load this project'}
        action={
          <Button asChild variant="outline">
            <Link to="/app/projects">Back to projects</Link>
          </Button>
        }
      >
        {missing
          ? 'It may have been deleted, or it belongs to another organisation.'
          : error.message}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Link
          to="/app/projects"
          className="inline-flex items-center gap-1 rounded-lg text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">
              {project.name}
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                {formatDateRange(project.startDate, project.endDate)}
              </span>
              <span className="capitalize">· {project.status}</span>
              {project.csrCategory && <span>· {project.csrCategory}</span>}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <EditProjectDialog project={project} />
              <DeleteProjectButton project={project} />
            </div>
          )}
        </div>
        {project.sdgGoals.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="SDG goals">
            {project.sdgGoals.map((g) => (
              <li key={g}>
                <SdgChip goal={g} />
              </li>
            ))}
          </ul>
        )}
      </header>

      <nav
        aria-label="Project sections"
        className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex gap-1">
          {TABS.map((tab) => (
            <li key={tab.label}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'relative block px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150',
                    isActive
                      ? 'text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet context={{ project, isAdmin, openAsset: setAsset } satisfies ProjectContext} />
      <AssetDrawer assetId={openAssetId} onOpenAsset={setAsset} onClose={() => setAsset(null)} />
    </div>
  );
}

function DeleteProjectButton({ project }: { project: ProjectSummary }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${project.id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.project(project.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success(`Deleted “${project.name}”`);
      navigate('/app/projects');
    },
    onError: (err) => toast.error(`Couldn’t delete the project: ${err.message}`),
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm">
          <Trash2 /> Delete
        </Button>
      }
      title={`Delete “${project.name}”?`}
      description={
        project.assetCount > 0
          ? `This permanently deletes the project, its ${project.siteCount} sites and ${project.assetCount} evidence files. Evidence in other projects that matched it is re-scored.`
          : 'This permanently deletes the project and its sites.'
      }
      confirmLabel="Delete project"
      pending={remove.isPending}
      onConfirm={() => remove.mutate()}
    />
  );
}

function ProjectSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading project…</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
