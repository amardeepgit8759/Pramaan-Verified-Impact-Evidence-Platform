import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Gauge, Images, MapPinOff, ShieldCheck, ShieldX } from 'lucide-react';
import { Link } from 'react-router';
import { BandDonut } from '@/components/charts/band-donut';
import { ChartCard } from '@/components/charts/chart-parts';
import { UploadsChart } from '@/components/charts/uploads-chart';
import { FormError } from '@/components/field';
import { StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth';
import { greeting } from '@/lib/format';
import { metricsQuery, projectsQuery } from '@/lib/queries';
import { ActivityFeed, GapAlerts, ReviewQueuePreview } from './dashboard-panels';
import { ProjectCard, ProjectGridSkeleton } from './project-card';
import { NoProjects } from './projects';

const RECENT = 6;

export function DashboardPage() {
  const { data: session } = useSession();
  const projects = useQuery(projectsQuery);
  const metrics = useQuery(metricsQuery());
  if (!session) return null;
  const isAdmin = session.user.role === 'admin';

  const header = (
    <header>
      <p className="text-sm font-medium text-muted-foreground">{session.org.name}</p>
      <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">
        {greeting()}, {session.user.name.split(' ')[0]}
      </h1>
    </header>
  );

  if (projects.data && projects.data.length === 0) {
    return (
      <div className="space-y-10">
        {header}
        <NoProjects isAdmin={isAdmin} />
      </div>
    );
  }

  const m = metrics.data;
  return (
    <div className="space-y-8">
      {header}

      {metrics.error ? (
        <FormError message={`Couldn’t load live figures: ${metrics.error.message}`} />
      ) : !m ? (
        <DashboardSkeleton />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatTile label="Total evidence" value={m.totalAssets} icon={Images} />
            <StatTile
              label="Verified"
              value={m.verifiedPct}
              format={(n) => `${Math.round(n)}%`}
              icon={ShieldCheck}
              tone="verified"
              hint={`${m.bands.verified.toLocaleString()} files`}
            />
            <StatTile
              label="Flagged this week"
              value={m.flaggedLast7Days}
              icon={ShieldX}
              tone="flagged"
              hint={`${m.bands.flagged.toLocaleString()} flagged in total`}
            />
            <StatTile
              label="Average trust"
              value={m.averageTrust}
              format={(n) => String(Math.round(n))}
              icon={Gauge}
            />
            <StatTile
              label="Sites with gaps"
              value={m.gapSites.length}
              icon={MapPinOff}
              tone={m.gapSites.length > 0 ? 'review' : 'default'}
            />
          </dl>

          <div className="grid gap-4 lg:grid-cols-5">
            <ChartCard
              title="Uploads per day"
              description="Last 30 days, all projects"
              className="lg:col-span-3"
              dimmed={metrics.isFetching}
            >
              <UploadsChart data={m.uploadsPerDay} />
            </ChartCard>
            <ChartCard
              title="Trust bands"
              description="Where your evidence stands now"
              className="lg:col-span-2"
              dimmed={metrics.isFetching}
            >
              {m.totalAssets > 0 ? (
                <BandDonut bands={m.bands} />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No evidence yet. Upload photos to a project to see how they score.
                </p>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ActivityFeed />
            <ReviewQueuePreview total={m.needsReview} />
            <GapAlerts gaps={m.gapSites} />
          </div>
        </>
      )}

      <section aria-labelledby="dash-projects" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="dash-projects" className="text-lg font-semibold tracking-tight">
            Projects
          </h2>
          {projects.data && projects.data.length > RECENT && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/projects">
                All {projects.data.length} projects <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
        {projects.isPending ? (
          <ProjectGridSkeleton />
        ) : projects.error ? (
          <FormError message={`Couldn’t load projects: ${projects.error.message}`} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {projects.data.slice(0, RECENT).map((p) => (
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

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Loading live figures…</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}
