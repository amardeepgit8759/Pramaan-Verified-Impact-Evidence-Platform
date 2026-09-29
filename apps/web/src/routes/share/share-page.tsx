import { thumbnailAspect, type SharedEvidence, type SharedProject } from '@pramaan/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  FileText,
  Images,
  Link2Off,
  NotebookPen,
  ShieldCheck,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BandBadge } from '@/components/band-badge';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { LogoMark } from '@/components/logo';
import { EvidenceSheet, type EvidenceItem } from '@/components/report/evidence-sheet';
import { ReportDocument } from '@/components/report/report-document';
import { SdgChip } from '@/components/sdg-chip';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { altText } from '@/lib/assets';
import { formatDateRange, formatIsoDate } from '@/lib/format';
import { sharedProjectQuery, sharedReportQuery } from '@/lib/queries';

const EvidenceMap = lazy(() => import('@/components/map/evidence-map'));

/** Evidence shown before "Show all". */
const GALLERY_PAGE = 24;

/** The public, read-only funder view of one project, opened by a share link. */
export function SharePage() {
  const { token = '', reportId } = useParams();
  const shared = useQuery(sharedProjectQuery(token));
  const orgName = shared.data?.organisationName;

  useEffect(() => {
    const previous = document.title;
    if (shared.data) document.title = `${shared.data.project.name} · verified evidence`;
    return () => {
      document.title = previous;
    };
  }, [shared.data]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="inline-flex items-center gap-2.5 text-lg font-semibold">
            <LogoMark />
            <span className="tracking-tight">Pramaan</span>
          </span>
          <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex">
            <ShieldCheck className="size-4 text-verified" aria-hidden /> Verified evidence ·
            read-only
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {shared.isPending ? (
          <ShareSkeleton />
        ) : shared.error ? (
          <LinkProblem error={shared.error} />
        ) : reportId ? (
          <SharedReport token={token} reportId={reportId} />
        ) : (
          <SharedProjectView token={token} shared={shared.data} />
        )}
      </main>

      <footer className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          {orgName ? `Shared by ${orgName} through Pramaan. ` : ''}Only evidence that passed
          verification, or that an admin reviewed and approved, is shown. Reports are aligned to SDG
          and CSR categories and don’t assert legal compliance.
        </p>
      </footer>
    </div>
  );
}

function LinkProblem({ error }: { error: Error }) {
  if (error instanceof ApiError && error.status === 410) {
    return (
      <EmptyState icon={Clock} title="This link has expired">
        Funder links stop working after a set time. Ask the organisation that shared it for a new
        one.
      </EmptyState>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState icon={Link2Off} title="This link doesn’t work">
        It may have been revoked, or the address may be incomplete. Check the link you were sent, or
        ask for a new one.
      </EmptyState>
    );
  }
  return <FormError message={`Couldn’t load this page: ${error.message}`} />;
}

function SharedProjectView({ token, shared }: { token: string; shared: SharedProject }) {
  const { project, metrics } = shared;
  const [selected, setSelected] = useState<EvidenceItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const byId = new Map(shared.evidence.map((e) => [e.asset.id, e]));
  const open = (e: SharedEvidence) => {
    setSelected(e);
    setSheetOpen(true);
  };
  const gallery = showAll ? shared.evidence : shared.evidence.slice(0, GALLERY_PAGE);

  const stats = [
    { label: 'Verified evidence files', value: String(metrics.evidence) },
    {
      label: 'Sites documented',
      value: metrics.sites > 0 ? `${metrics.sitesWithEvidence} of ${metrics.sites}` : '0',
    },
    {
      label: 'Average Trust Score',
      value: metrics.averageTrust === null ? '–' : String(Math.round(metrics.averageTrust)),
    },
    {
      label: 'Of all uploads, verified automatically',
      value: metrics.verifiedPct === null ? '–' : `${Math.round(metrics.verifiedPct)}%`,
    },
  ];

  return (
    <div className="space-y-12">
      <section className="space-y-5">
        <p className="text-sm font-semibold tracking-wider text-verified uppercase">
          {shared.organisationName}
        </p>
        <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-6xl">
          {project.name}
        </h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden />
            {formatDateRange(project.startDate, project.endDate)}
          </span>
          <span className="capitalize">· {project.status}</span>
          {metrics.lastEvidenceAt && (
            <span>· latest evidence {formatIsoDate(metrics.lastEvidenceAt.slice(0, 10))}</span>
          )}
        </p>
        {project.description && (
          <p className="max-w-3xl text-lg leading-relaxed">{project.description}</p>
        )}
        {(project.sdgGoals.length > 0 || project.csrCategory) && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Aligned to">
            {project.sdgGoals.map((g) => (
              <li key={g}>
                <SdgChip goal={g} />
              </li>
            ))}
            {project.csrCategory && (
              <li className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium">
                CSR · {project.csrCategory}
              </li>
            )}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          This link works until {formatIsoDate(shared.expiresAt.slice(0, 10))}.
        </p>
      </section>

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

      <section aria-labelledby="shared-reports" className="space-y-4">
        <h2 id="shared-reports" className="font-display text-3xl">
          Reports
        </h2>
        {shared.reports.length === 0 ? (
          <EmptyState icon={NotebookPen} title="No reports shared yet">
            The organisation hasn’t published a report for this project. The verified evidence below
            is available now.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {shared.reports.map((r) => (
              <li key={r.id} className="space-y-3 rounded-2xl border bg-card p-5 shadow-soft">
                <h3 className="font-semibold">
                  {formatIsoDate(r.periodStart)} – {formatIsoDate(r.periodEnd)}
                </h3>
                {r.summary && (
                  <p className="line-clamp-3 text-sm text-muted-foreground">{r.summary}</p>
                )}
                <p className="text-sm">
                  {r.claimCount} cited statements · {r.citedAssetCount} evidence files
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to={`/share/${token}/reports/${r.id}`}>Read report</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/share/${token}/reports/${r.id}/pdf`} download>
                      <FileText /> PDF
                    </a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shared.sites.length > 0 && (
        <section aria-labelledby="shared-map" className="space-y-4">
          <h2 id="shared-map" className="font-display text-3xl">
            Where the work happens
          </h2>
          <Suspense fallback={<Skeleton className="h-[28rem] rounded-2xl" />}>
            <EvidenceMap
              sites={shared.sites}
              assets={shared.evidence.map((e) => e.asset)}
              onOpenAsset={(id) => {
                const e = byId.get(id);
                if (e) open(e);
              }}
            />
          </Suspense>
        </section>
      )}

      <section aria-labelledby="shared-evidence" className="space-y-4">
        <h2 id="shared-evidence" className="font-display text-3xl">
          Verified evidence
        </h2>
        {shared.evidence.length === 0 ? (
          <EmptyState icon={Images} title="No verified evidence yet">
            Photos appear here once they pass verification or an admin approves them.
          </EmptyState>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gallery.map((e) => (
                <li key={e.asset.id}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => open(e)}
                    aria-label={`${altText(e.asset)}. Trust Score ${e.asset.trustScore}. Open details`}
                    className="group block w-full overflow-hidden rounded-2xl border bg-card text-left shadow-soft transition-shadow duration-150 hover:shadow-lift"
                  >
                    <div
                      className="relative bg-muted"
                      style={{
                        aspectRatio: String(thumbnailAspect(e.asset.width, e.asset.height)),
                      }}
                    >
                      <img
                        src={e.asset.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      <BandBadge
                        band={e.asset.trustBand}
                        className="absolute right-2 bottom-2 shadow-soft"
                      />
                    </div>
                    <p className="truncate px-3 py-2.5 text-xs">
                      {e.asset.siteName ?? 'No site'} ·{' '}
                      {formatIsoDate((e.asset.capturedAt ?? e.asset.uploadedAt).slice(0, 10))}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {!showAll && shared.evidence.length > GALLERY_PAGE && (
              <Button variant="outline" onClick={() => setShowAll(true)}>
                Show all {shared.evidence.length}
              </Button>
            )}
          </>
        )}
      </section>

      {selected && (
        <EvidenceSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={selected.asset.caption ?? 'Evidence'}
          description={`Trust Score ${selected.asset.trustScore} of 100. Every check and its result is listed below.`}
          items={[selected]}
        />
      )}
    </div>
  );
}

function SharedReport({ token, reportId }: { token: string; reportId: string }) {
  const report = useQuery(sharedReportQuery(token, reportId));
  const back = (
    <Link
      to={`/share/${token}`}
      className="inline-flex items-center gap-1 rounded-lg text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden /> Back to the project
    </Link>
  );
  if (report.isPending) return <ShareSkeleton />;
  if (report.error) {
    return (
      <div className="space-y-6">
        {back}
        {report.error instanceof ApiError && report.error.status === 404 ? (
          <EmptyState icon={NotebookPen} title="Report not found">
            It may have been removed by the organisation.
          </EmptyState>
        ) : (
          <LinkProblem error={report.error} />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-3xl">{back}</div>
      <ReportDocument
        report={report.data}
        asPageTitle
        downloads={{
          pdf: `/api/share/${token}/reports/${reportId}/pdf`,
          csv: `/api/share/${token}/reports/${reportId}/annex.csv`,
        }}
      />
    </div>
  );
}

function ShareSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-14 w-2/3" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
