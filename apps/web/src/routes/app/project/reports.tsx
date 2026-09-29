import {
  reportInput,
  reportSummarySchema,
  type ReportInput,
  type ReportSummary,
} from '@pramaan/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleX,
  FileSpreadsheet,
  FileText,
  Loader2,
  NotebookPen,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatIsoDate, relativeTime } from '@/lib/format';
import { describeError, validate, type FieldErrors } from '@/lib/forms';
import { queryKeys, reportsQuery } from '@/lib/queries';
import { useProject } from './project-layout';

const today = () => new Date().toISOString().slice(0, 10);

/** The project so far: its start date to today (or its end date, if that's earlier). */
function defaultPeriod(project: { startDate: string; endDate: string | null }): ReportInput {
  const end = project.endDate && project.endDate < today() ? project.endDate : today();
  return {
    periodStart: project.startDate,
    periodEnd: end < project.startDate ? project.startDate : end,
  };
}

function useGenerateReport(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReportInput) =>
      api.post(`/projects/${projectId}/reports`, input, reportSummarySchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports(projectId) });
      toast.success('Writing your report. You’ll get a notification when it’s ready.');
    },
  });
}

export function ProjectReports() {
  const { project, isAdmin } = useProject();
  const reports = useQuery(reportsQuery(project.id));
  const [dialogOpen, setDialogOpen] = useState(false);

  const generateButton = isAdmin && (
    <Button onClick={() => setDialogOpen(true)}>
      <Sparkles /> Generate report
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Reports are written from verified evidence only, and every sentence links to the photos
          behind it.
        </p>
        {reports.data && reports.data.length > 0 && generateButton}
      </div>

      {reports.isPending ? (
        <div className="grid gap-3" aria-busy="true">
          <span className="sr-only">Loading reports…</span>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : reports.error ? (
        <FormError message={`Couldn’t load reports: ${reports.error.message}`} />
      ) : reports.data.length === 0 ? (
        <EmptyState icon={NotebookPen} title="No reports yet" action={generateButton || undefined}>
          {isAdmin
            ? 'Turn this project’s verified evidence into a funder-ready report, where every sentence links to its photos.'
            : 'An admin can generate a funder-ready report from this project’s verified evidence.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {reports.data.map((r) => (
            <li key={r.id}>
              <ReportCard report={r} projectId={project.id} isAdmin={isAdmin} />
            </li>
          ))}
        </ul>
      )}

      <GenerateReportDialog project={project} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ReportStatus({ status }: { status: ReportSummary['status'] }) {
  if (status === 'generating') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-review">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Writing…
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-flagged">
        <CircleX className="size-4" aria-hidden /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-verified">
      <CircleCheck className="size-4" aria-hidden /> Ready
    </span>
  );
}

function ReportCard({
  report,
  projectId,
  isAdmin,
}: {
  report: ReportSummary;
  projectId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const retry = useGenerateReport(projectId);
  const remove = useMutation({
    mutationFn: () => api.delete(`/reports/${report.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports(projectId) });
      toast.success('Report deleted');
      setConfirmOpen(false);
    },
    onError: (err) => toast.error(`Couldn’t delete the report: ${err.message}`),
  });
  const period = `${formatIsoDate(report.periodStart)} – ${formatIsoDate(report.periodEnd)}`;

  return (
    <article
      className="space-y-3 rounded-2xl border bg-card p-5 shadow-soft"
      aria-label={`Report for ${period}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-semibold tracking-tight">{period}</h2>
          <p className="text-xs text-muted-foreground">
            {report.generatedBy ? `${report.generatedBy} · ` : ''}
            {relativeTime(report.createdAt)}
          </p>
        </div>
        <ReportStatus status={report.status} />
      </div>

      {report.status === 'ready' && (
        <>
          {report.summary && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{report.summary}</p>
          )}
          <p className="text-sm">
            {report.claimCount} cited statements · {report.citedAssetCount} evidence files
            {report.droppedClaims > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · {report.droppedClaims} uncited removed
              </span>
            )}
          </p>
        </>
      )}
      {report.status === 'generating' && (
        <p className="text-sm text-muted-foreground">
          The AI is writing from verified evidence; every sentence will be checked for citations
          before it’s kept.
        </p>
      )}
      {report.status === 'failed' && report.error && (
        <p className="text-sm text-flagged">{report.error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {report.status === 'ready' && (
          <>
            <Button asChild size="sm">
              <Link to={report.id}>Read report</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/reports/${report.id}/pdf`} download>
                <FileText /> PDF
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/reports/${report.id}/annex.csv`} download>
                <FileSpreadsheet /> CSV
              </a>
            </Button>
          </>
        )}
        {report.status === 'failed' && isAdmin && (
          <Button
            variant="outline"
            size="sm"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(
                { periodStart: report.periodStart, periodEnd: report.periodEnd },
                { onError: (err) => toast.error(err.message) },
              )
            }
          >
            <RotateCcw /> Try again
          </Button>
        )}
        {isAdmin && report.status !== 'generating' && (
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            trigger={
              <Button variant="ghost" size="sm" className="ml-auto">
                <Trash2 /> Delete
              </Button>
            }
            title="Delete this report?"
            description={`The report for ${period} and its downloads will stop working, including on funder links. The evidence itself isn’t affected.`}
            confirmLabel="Delete report"
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        )}
      </div>
    </article>
  );
}

function GenerateReportDialog({
  project,
  open,
  onOpenChange,
}: {
  project: { id: string; startDate: string; endDate: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a report</DialogTitle>
          <DialogDescription>
            Pick the period to report on. Only verified or admin-approved evidence captured in it is
            used, and any sentence that doesn’t cite it is removed.
          </DialogDescription>
        </DialogHeader>
        {open && <GenerateForm project={project} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function GenerateForm({
  project,
  onDone,
}: {
  project: { id: string; startDate: string; endDate: string | null };
  onDone: () => void;
}) {
  const initial = defaultPeriod(project);
  const [start, setStart] = useState(initial.periodStart);
  const [end, setEnd] = useState(initial.periodEnd);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const generate = useGenerateReport(project.id);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validate(reportInput, { periodStart: start, periodEnd: end });
    setErrors(result.errors ?? {});
    setMessage(null);
    if (!result.data) return;
    generate.mutate(result.data, {
      onSuccess: onDone,
      onError: (err) => {
        const described = describeError(err);
        setErrors(described.fields);
        setMessage(described.message);
      },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" error={errors.periodStart}>
          {(props) => (
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              {...props}
            />
          )}
        </Field>
        <Field label="To" error={errors.periodEnd}>
          {(props) => (
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} {...props} />
          )}
        </Field>
      </div>
      {message && <FormError message={message} />}
      <DialogFooter>
        <Button type="submit" disabled={generate.isPending}>
          {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate
        </Button>
      </DialogFooter>
    </form>
  );
}
