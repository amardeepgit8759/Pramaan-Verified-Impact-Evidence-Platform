import {
  assetDetailSchema,
  reviewInput,
  type AssetDetail,
  type ReviewDecision,
} from '@pramaan/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { describeError } from '@/lib/forms';
import { queryKeys } from '@/lib/queries';

/**
 * Approve or reject evidence that isn't verified. The note is required and goes into the
 * append-only review log and the report's evidence annex.
 */
export function ReviewForm({
  asset,
  onDone,
  compact = false,
}: {
  asset: AssetDetail | Pick<AssetDetail, 'id' | 'projectId'>;
  onDone?: (updated: AssetDetail) => void;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  const review = useMutation({
    mutationFn: (decision: ReviewDecision) =>
      api.post(`/assets/${asset.id}/review`, { decision, note }, assetDetailSchema),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.asset(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['metrics'] });
      toast.success(updated.reviewDecision === 'approve' ? 'Approved' : 'Rejected');
      setNote('');
      onDone?.(updated);
    },
    onError: (err) => {
      const { fields, message } = describeError(err);
      setError(fields.note ?? message);
    },
  });

  function decide(decision: ReviewDecision) {
    const parsed = reviewInput.safeParse({ decision, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Add a note');
      return;
    }
    setError(null);
    review.mutate(decision);
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={noteId} className={compact ? 'sr-only' : undefined}>
          Review note
        </Label>
        <Textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={compact ? 2 : 3}
          placeholder="What did you check? e.g. confirmed with the site coordinator"
          aria-invalid={!!error}
          aria-describedby={error ? `${noteId}-error` : undefined}
        />
        {error && (
          <p id={`${noteId}-error`} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide('approve')} disabled={review.isPending}>
          {review.isPending && review.variables === 'approve' ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ShieldCheck />
          )}
          Approve
        </Button>
        <Button variant="outline" onClick={() => decide('reject')} disabled={review.isPending}>
          {review.isPending && review.variables === 'reject' ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ShieldX />
          )}
          Reject
        </Button>
      </div>
    </div>
  );
}
