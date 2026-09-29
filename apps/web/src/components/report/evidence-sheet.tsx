import { isReportEligible, type Asset, type Review, type TrustCheck } from '@pramaan/shared';
import { ExternalLink, Maximize2, TriangleAlert } from 'lucide-react';
import { BandBadge } from '@/components/band-badge';
import { TrustBreakdown } from '@/components/trust/trust-breakdown';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { altText } from '@/lib/assets';
import { formatIsoDate } from '@/lib/format';

export interface EvidenceItem {
  /** "E1" in a report; absent elsewhere. */
  ref?: string;
  asset: Asset;
  checks: TrustCheck[];
  reviews?: Review[];
}

/**
 * Side panel with the evidence behind a statement (or one piece of evidence): the photo,
 * its Trust Score and every check, and any review decisions.
 */
export function EvidenceSheet({
  open,
  onOpenChange,
  title,
  description,
  items,
  onOpenAsset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  items: EvidenceItem[];
  /** In the app, open the full evidence drawer. */
  onOpenAsset?: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <div className="border-b px-6 pt-6 pb-4 pr-14">
          <SheetTitle className="font-display text-2xl font-normal leading-snug">
            {title}
          </SheetTitle>
          <SheetDescription className="mt-1">{description}</SheetDescription>
        </div>
        <ul className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
          {items.map((item) => (
            <li key={item.asset.id}>
              <EvidenceCard item={item} onOpenAsset={onOpenAsset} />
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function EvidenceCard({
  item: { ref, asset, checks, reviews = [] },
  onOpenAsset,
}: {
  item: EvidenceItem;
  onOpenAsset?: (id: string) => void;
}) {
  const eligible = isReportEligible(asset.trustBand, asset.reviewDecision);
  const when = asset.capturedAt ?? asset.uploadedAt;
  return (
    <article className="space-y-4" aria-label={ref ? `Evidence ${ref}` : altText(asset)}>
      <img
        src={asset.previewUrl}
        alt={altText(asset)}
        className="aspect-[4/3] w-full rounded-2xl border bg-muted object-cover"
      />
      <div className="flex flex-wrap items-center gap-2">
        {ref && (
          <span className="rounded-md bg-verified-soft px-1.5 py-0.5 text-xs font-semibold text-verified">
            {ref}
          </span>
        )}
        <BandBadge band={asset.trustBand} />
        <span className="text-sm font-medium">Trust Score {asset.trustScore}</span>
      </div>
      <div className="space-y-1 text-sm">
        {asset.caption && <p>{asset.caption}</p>}
        <p className="text-muted-foreground">
          {asset.siteName ?? 'No site'} · {asset.capturedAt ? 'captured' : 'uploaded'}{' '}
          {formatIsoDate(when.slice(0, 10))}
        </p>
      </div>
      {!eligible && (
        <p className="flex items-start gap-2 rounded-xl border bg-flagged-soft px-3 py-2 text-sm text-flagged">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          This file no longer counts as verified evidence: it changed after the report was
          generated.
        </p>
      )}
      <TrustBreakdown checks={checks} matches={{}} />
      {reviews.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Review decisions</h3>
          <ul className="space-y-2 text-sm">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border bg-card px-3 py-2">
                <span className="font-medium">
                  {r.decision === 'approve' ? 'Approved' : 'Rejected'} by {r.reviewerName}
                </span>{' '}
                <span className="text-muted-foreground">
                  on {formatIsoDate(r.createdAt.slice(0, 10))} at score {r.trustScoreAtReview}
                </span>
                <p className="mt-1">“{r.note}”</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {onOpenAsset && (
          <Button variant="outline" size="sm" onClick={() => onOpenAsset(asset.id)}>
            <Maximize2 /> Full details
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <a href={asset.secureUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Original file
          </a>
        </Button>
      </div>
    </article>
  );
}
