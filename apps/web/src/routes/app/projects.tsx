import { useQuery } from '@tanstack/react-query';
import { FolderPlus } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { useSession } from '@/lib/auth';
import { projectsQuery } from '@/lib/queries';
import { CreateProjectDialog } from './create-project-dialog';
import { ProjectCard, ProjectGridSkeleton } from './project-card';

export function ProjectsPage() {
  const { data: session } = useSession();
  const { data: projects, isPending, error } = useQuery(projectsQuery);
  const isAdmin = session?.user.role === 'admin';

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Projects</h1>
          <p className="mt-1 text-muted-foreground">
            Each project holds its sites, evidence and reports.
          </p>
        </div>
        {isAdmin && projects && projects.length > 0 && <CreateProjectDialog />}
      </header>

      {isPending ? (
        <ProjectGridSkeleton />
      ) : error ? (
        <FormError message={`Couldn’t load projects: ${error.message}`} />
      ) : projects.length === 0 ? (
        <NoProjects isAdmin={isAdmin} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="flex [&>article]:w-full">
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NoProjects({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? (
    <EmptyState
      icon={FolderPlus}
      title="Create your first project"
      action={<CreateProjectDialog />}
    >
      A project groups the sites, photos and reports for one programme, like a borewell drive or a
      school build. Evidence is scored against its dates and sites.
    </EmptyState>
  ) : (
    <EmptyState icon={FolderPlus} title="No projects yet">
      Your admin hasn’t created any projects yet. Once they do, you’ll see them here and can start
      uploading evidence.
    </EmptyState>
  );
}
