import { Images, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { TrustBar } from '@/components/trust-bar';
import { Button } from '@/components/ui/button';
import { useProject } from './project-layout';

export function ProjectOverview() {
  const { project, isAdmin } = useProject();
  const total = project.assetCount;
  const verifiedShare = total > 0 ? Math.round((project.bands.verified / total) * 100) : null;

  const stats = [
    { label: 'Evidence files', value: total.toLocaleString() },
    { label: 'Verified', value: verifiedShare === null ? '—' : `${verifiedShare}%` },
    {
      label: 'Average trust',
      value: project.averageTrust === null ? '—' : String(Math.round(project.averageTrust)),
    },
    { label: 'Sites', value: String(project.siteCount) },
  ];

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col-reverse rounded-2xl border bg-card p-5 shadow-soft"
          >
            <dt className="mt-1 text-sm text-muted-foreground">{s.label}</dt>
            <dd className="font-display text-4xl tabular">{s.value}</dd>
          </div>
        ))}
      </dl>

      {total > 0 ? (
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <h2 className="font-semibold tracking-tight">Trust across this project’s evidence</h2>
          <TrustBar bands={project.bands} className="mt-4 [&>div:first-child]:h-3" />
        </section>
      ) : project.siteCount === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Start by adding the project’s sites"
          action={
            <Button asChild>
              <Link to="sites">{isAdmin ? 'Add a site' : 'View sites'}</Link>
            </Button>
          }
        >
          Sites are the villages, schools or plots where the work happens. Each photo’s GPS is
          checked against its site’s location and radius.
        </EmptyState>
      ) : (
        <EmptyState
          icon={Images}
          title="No evidence yet"
          action={
            <Button asChild>
              <Link to="evidence">Go to evidence</Link>
            </Button>
          }
        >
          Photos and videos uploaded to this project appear here with their Trust Scores, checked
          for copies, location and dates.
        </EmptyState>
      )}

      {project.description && (
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <h2 className="font-semibold tracking-tight">About this project</h2>
          <p className="mt-2 whitespace-pre-line text-muted-foreground">{project.description}</p>
        </section>
      )}
    </div>
  );
}
