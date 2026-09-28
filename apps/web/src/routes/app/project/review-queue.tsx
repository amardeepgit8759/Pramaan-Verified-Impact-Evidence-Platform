import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { BandBadge } from '@/components/band-badge';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { altText } from '@/lib/assets';
import { assetQuery, reviewQueueQuery } from '@/lib/queries';
import { useProject } from './project-layout';
import { ReviewForm } from './review-form';

/**
 * Evidence waiting for an admin: needs review or flagged, no decision yet, oldest first.
 * Each item shows why it scored low, so the reviewer can decide without opening it.
 */
export function ProjectReview() {
  const { project, isAdmin, openAsset } = useProject();
  const { data: queue, isPending, error } = useQuery(reviewQueueQuery(project.id, 100));

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  if (error) return <FormError message={`Couldn’t load the review queue: ${error.message}`} />;
  if (queue.length === 0) {
    return (
      <EmptyState icon={ShieldCheck} title="Nothing to review">
        Every piece of evidence in this project is verified or already has a decision. Anything that
        scores lower lands here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {queue.length} waiting, oldest first.
        {isAdmin
          ? ' Approving makes evidence eligible for reports; the score stays visible.'
          : ' Only admins can approve or reject.'}
      </p>
      <ul className="space-y-4">
        {queue.map((a) => (
          <li
            key={a.id}
            className="grid gap-4 rounded-2xl border bg-card p-4 shadow-soft sm:grid-cols-[10rem_1fr]"
          >
            <button
              type="button"
              onClick={() => openAsset(a.id)}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted sm:aspect-square"
              aria-label={`${altText(a)}. Open details`}
            >
              <img src={a.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
            </button>
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <BandBadge band={a.trustBand} />
                <span className="text-sm font-semibold tabular">Score {a.trustScore}</span>
                <span className="text-sm text-muted-foreground">
                  · {a.siteName ?? 'No site'} · {a.uploadedBy ?? 'Unknown uploader'}
                </span>
              </div>
              <FailedReasons assetId={a.id} />
              {isAdmin ? (
                <ReviewForm asset={a} compact />
              ) : (
                <Button variant="outline" size="sm" onClick={() => openAsset(a.id)}>
                  View details
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The failed checks' reasons, fetched with the asset's detail (also used by the drawer). */
function FailedReasons({ assetId }: { assetId: string }) {
  const { data } = useQuery(assetQuery(assetId));
  if (!data) return <Skeleton className="h-10" />;
  const failed = data.checks.filter((c) => !c.passed);
  return (
    <ul className="space-y-1 text-sm">
      {failed.map((c) => (
        <li key={c.type} className="flex gap-2">
          <span className="shrink-0 font-semibold text-flagged tabular">−{c.deduction}</span>
          <span className="text-muted-foreground">{c.reason}</span>
        </li>
      ))}
    </ul>
  );
}
