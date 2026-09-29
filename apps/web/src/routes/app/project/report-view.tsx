import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, FileX, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { ReportDocument } from '@/components/report/report-document';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { reportQuery } from '@/lib/queries';
import { useProject } from './project-layout';

export function ProjectReport() {
  const { reportId = '' } = useParams();
  const { openAsset } = useProject();
  const { data: report, isPending, error } = useQuery(reportQuery(reportId));

  const back = (
    <Link
      to=".."
      relative="path"
      className="inline-flex items-center gap-1 rounded-lg text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden /> All reports
    </Link>
  );

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-busy="true">
        <span className="sr-only">Loading report…</span>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-3/4" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }
  if (error || report.status === 'failed') {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <EmptyState
        icon={FileX}
        title={missing ? 'Report not found' : 'This report couldn’t be generated'}
        action={
          <Button asChild variant="outline">
            <Link to=".." relative="path">
              Back to reports
            </Link>
          </Button>
        }
      >
        {missing
          ? 'It may have been deleted.'
          : (error?.message ?? report?.error ?? 'Try generating it again.')}
      </EmptyState>
    );
  }
  if (report.status === 'generating') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {back}
        <div className="space-y-4 rounded-2xl border bg-card p-6" aria-live="polite">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="size-4 animate-spin text-review" aria-hidden /> Writing your report…
          </p>
          <p className="text-sm text-muted-foreground">
            The AI is drafting from verified evidence only. Each sentence is checked for citations
            before it’s kept. This page updates on its own.
          </p>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-3xl">{back}</div>
      <ReportDocument
        report={report}
        downloads={{
          pdf: `/api/reports/${report.id}/pdf`,
          csv: `/api/reports/${report.id}/annex.csv`,
        }}
        onOpenAsset={openAsset}
      />
    </div>
  );
}
