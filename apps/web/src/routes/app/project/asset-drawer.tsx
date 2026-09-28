import type { AssetDetail } from '@pramaan/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, ShieldCheck, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { BandBadge } from '@/components/band-badge';
import { FormError } from '@/components/field';
import { TrustBreakdown } from '@/components/trust/trust-breakdown';
import { TrustGauge } from '@/components/trust/trust-gauge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { altText } from '@/lib/assets';
import { useSession } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { assetQuery, settingsQuery } from '@/lib/queries';
import { ReviewForm } from './review-form';

const PROVIDER_LABEL = {
  cloudinary: 'Cloudinary auto-tagging',
  gemini: 'Gemini vision',
  none: 'Not tagged',
} as const;

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const formatBytes = (n: number) =>
  n < 1_000_000 ? `${Math.round(n / 1000)} KB` : `${(n / 1_000_000).toFixed(1)} MB`;

/** Evidence detail in a side drawer. `assetId` null means closed. */
export function AssetDrawer({
  assetId,
  onOpenAsset,
  onClose,
}: {
  assetId: string | null;
  onOpenAsset: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={assetId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {assetId && <AssetDetailView id={assetId} onOpenAsset={onOpenAsset} />}
      </SheetContent>
    </Sheet>
  );
}

function AssetDetailView({ id, onOpenAsset }: { id: string; onOpenAsset: (id: string) => void }) {
  const { data: asset, isPending, error } = useQuery(assetQuery(id));
  const { data: settings } = useQuery(settingsQuery);
  const { data: session } = useSession();

  if (isPending) {
    return (
      <div className="space-y-4 p-6" aria-busy="true">
        <SheetTitle className="sr-only">Loading evidence</SheetTitle>
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        <Skeleton className="h-36 w-36 rounded-full" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <SheetTitle>Evidence</SheetTitle>
        <FormError message={`Couldn’t load this evidence: ${error.message}`} />
      </div>
    );
  }

  const canReview = session?.user.role === 'admin' && asset.trustBand !== 'verified';
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-ink">
        {asset.resourceType === 'video' ? (
          <video
            src={asset.secureUrl}
            poster={asset.previewUrl}
            controls
            className="max-h-[60vh] w-full object-contain"
          />
        ) : (
          <img
            src={asset.previewUrl}
            alt={altText(asset)}
            className="max-h-[60vh] w-full object-contain"
          />
        )}
      </div>

      <div className="space-y-8 p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <BandBadge band={asset.trustBand} />
            {asset.reviewDecision && <DecisionBadge decision={asset.reviewDecision} />}
          </div>
          <SheetTitle className="text-xl">{asset.originalFilename ?? 'Evidence'}</SheetTitle>
          <SheetDescription>
            {asset.projectName}
            {asset.siteName ? ` · ${asset.siteName}` : ' · no site'}
          </SheetDescription>
          {asset.caption && <p className="text-sm">{asset.caption}</p>}
        </header>

        <section aria-labelledby="trust-heading" className="space-y-4">
          <h3 id="trust-heading" className="font-semibold tracking-tight">
            Trust Score
          </h3>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <TrustGauge
              score={asset.trustScore}
              band={asset.trustBand}
              cutoffs={
                settings && {
                  verified: settings.settings.bandVerifiedMin,
                  review: settings.settings.bandReviewMin,
                }
              }
              className="shrink-0"
            />
            <div className="w-full min-w-0">
              <TrustBreakdown
                checks={asset.checks}
                matches={asset.matches}
                onOpenAsset={onOpenAsset}
              />
            </div>
          </div>
        </section>

        {canReview && (
          <section
            aria-labelledby="review-heading"
            className="space-y-3 rounded-2xl border bg-card p-5"
          >
            <h3 id="review-heading" className="font-semibold tracking-tight">
              {asset.reviewDecision ? 'Change the decision' : 'Review this evidence'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Approving makes it eligible for reports. The score and checks stay as they are.
            </p>
            <ReviewForm asset={asset} />
          </section>
        )}

        {asset.reviews.length > 0 && <ReviewHistory reviews={asset.reviews} />}

        <section aria-labelledby="tags-heading" className="space-y-3">
          <h3 id="tags-heading" className="font-semibold tracking-tight">
            Tags
          </h3>
          {asset.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {asset.tags.map((t) => (
                <li key={t} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No tags.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Tagged by: {PROVIDER_LABEL[asset.taggingProvider]}
          </p>
        </section>

        <MetadataTable asset={asset} />
      </div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: 'approve' | 'reject' }) {
  return decision === 'approve' ? (
    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
      <ShieldCheck className="size-3.5 text-verified" aria-hidden /> Approved by admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
      <ShieldX className="size-3.5 text-flagged" aria-hidden /> Rejected by admin
    </span>
  );
}

function ReviewHistory({ reviews }: { reviews: AssetDetail['reviews'] }) {
  return (
    <section aria-labelledby="history-heading" className="space-y-3">
      <h3 id="history-heading" className="font-semibold tracking-tight">
        Review history
      </h3>
      <ol className="space-y-3 border-l pl-4">
        {reviews.map((r) => (
          <li key={r.id} className="relative text-sm">
            <span
              aria-hidden
              className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-foreground"
            />
            <p className="font-medium">
              {r.reviewerName} {r.decision === 'approve' ? 'approved' : 'rejected'} at score{' '}
              {r.trustScoreAtReview}
            </p>
            <p className="text-muted-foreground">“{r.note}”</p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={r.createdAt}>{relativeTime(r.createdAt)}</time>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MetadataTable({ asset }: { asset: AssetDetail }) {
  const [copied, setCopied] = useState(false);
  const rows: [string, React.ReactNode][] = [
    [
      'Captured',
      asset.capturedAt ? dateTime.format(new Date(asset.capturedAt)) : 'Not in the file',
    ],
    [
      'Uploaded',
      `${dateTime.format(new Date(asset.uploadedAt))}${asset.uploadedBy ? ` by ${asset.uploadedBy}` : ''}`,
    ],
    [
      'Location',
      asset.lat !== null && asset.lng !== null ? (
        <a
          href={`https://www.openstreetmap.org/?mlat=${asset.lat}&mlon=${asset.lng}#map=16/${asset.lat}/${asset.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline tabular"
        >
          {asset.lat.toFixed(5)}, {asset.lng.toFixed(5)}{' '}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        'Not in the file'
      ),
    ],
    [
      'Format',
      `${asset.format.toUpperCase()}${asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''} · ${formatBytes(asset.bytes)}`,
    ],
    ...Object.entries(asset.exif).map(([k, v]): [string, React.ReactNode] => [
      k,
      <span className="break-all tabular">{v}</span>,
    ]),
  ];

  return (
    <section aria-labelledby="meta-heading" className="space-y-3">
      <h3 id="meta-heading" className="font-semibold tracking-tight">
        Details
      </h3>
      <dl className="divide-y rounded-2xl border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0">{v}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Cloudinary</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <a
              href={asset.secureUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-primary hover:underline"
            >
              {asset.secureUrl}
            </a>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy the Cloudinary URL"
              onClick={async () => {
                await navigator.clipboard.writeText(asset.secureUrl).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </dd>
        </div>
      </dl>
    </section>
  );
}
