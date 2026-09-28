import type { MatchedAsset, TrustCheck } from '@pramaan/shared';
import { CircleCheck, CircleX } from 'lucide-react';
import { BandBadge } from '@/components/band-badge';
import { CHECK_META } from '@/lib/checks';
import { cn } from '@/lib/utils';

/**
 * Every check, pass or fail, with its deduction and plain-language reason. Checks that
 * matched another asset link to it.
 */
export function TrustBreakdown({
  checks,
  matches,
  onOpenAsset,
}: {
  checks: TrustCheck[];
  matches: Record<string, MatchedAsset>;
  onOpenAsset?: (id: string) => void;
}) {
  const total = checks.reduce((sum, c) => sum + c.deduction, 0);
  return (
    <div>
      <ul className="divide-y rounded-2xl border bg-card">
        {checks.map((check) => {
          const { label, icon: Icon } = CHECK_META[check.type];
          const matchedId =
            typeof check.detail.matchedAssetId === 'string' ? check.detail.matchedAssetId : null;
          const match = matchedId ? matches[matchedId] : undefined;
          return (
            <li key={check.type} className="flex gap-3 p-4" data-check={check.type}>
              <span
                className={cn(
                  'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                  check.passed ? 'bg-verified-soft text-verified' : 'bg-flagged-soft text-flagged',
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {label}
                  {check.passed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-verified">
                      <CircleCheck className="size-3.5" aria-hidden /> Passed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-flagged">
                      <CircleX className="size-3.5" aria-hidden /> Failed
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{check.reason}</p>
                {match && !check.passed && (
                  <button
                    type="button"
                    onClick={() => onOpenAsset?.(match.id)}
                    className="mt-2 flex w-full items-center gap-3 rounded-xl border bg-background p-2 text-left transition-colors hover:bg-accent"
                  >
                    <img
                      src={match.thumbnailUrl}
                      alt=""
                      className="size-10 rounded-lg bg-muted object-cover"
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium">Matched asset</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {match.projectName}
                      </span>
                    </span>
                    <BandBadge band={match.trustBand} />
                  </button>
                )}
              </div>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular',
                  check.deduction > 0 ? 'text-flagged' : 'text-muted-foreground',
                )}
                aria-label={
                  check.deduction > 0 ? `minus ${check.deduction} points` : 'no deduction'
                }
              >
                {check.deduction > 0 ? `−${check.deduction}` : '0'}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-right text-xs text-muted-foreground">
        100 − {total} ={' '}
        <span className="font-semibold text-foreground">{Math.max(0, 100 - total)}</span>
      </p>
    </div>
  );
}
