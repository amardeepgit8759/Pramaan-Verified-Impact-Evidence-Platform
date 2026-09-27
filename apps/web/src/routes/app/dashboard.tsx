import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth';
import { greeting } from '@/lib/format';
import { projectsQuery } from '@/lib/queries';
import { ProjectCard, ProjectGridSkeleton } from './project-card';
import { NoProjects } from './projects';

const RECENT = 6;

export function DashboardPage() {
  const { data: session } = useSession();
  const { data: projects, isPending, error } = useQuery(projectsQuery);
  if (!session) return null;

  return (
    <div className="space-y-10">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{session.org.name}</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">
          {greeting()}, {session.user.name.split(' ')[0]}
        </h1>
      </header>

      <section aria-labelledby="dash-projects" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="dash-projects" className="text-lg font-semibold tracking-tight">
            Projects
          </h2>
          {projects && projects.length > RECENT && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/projects">
                All {projects.length} projects <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
        {isPending ? (
          <ProjectGridSkeleton />
        ) : error ? (
          <FormError message={`Couldn’t load projects: ${error.message}`} />
        ) : projects.length === 0 ? (
          <NoProjects isAdmin={session.user.role === 'admin'} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {projects.slice(0, RECENT).map((p) => (
              <li key={p.id} className="flex [&>article]:w-full">
                <ProjectCard project={p} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
